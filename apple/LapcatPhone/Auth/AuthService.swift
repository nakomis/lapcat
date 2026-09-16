import AuthenticationServices
import CryptoKit
import Foundation

/// Cognito hosted-UI auth via PKCE authorisation code flow on the shared nakomis user pool.
/// Mirrors Recipator's `AuthService`, except the Lapcat API authorises with the **ID token**.
@MainActor
final class AuthService: NSObject, ObservableObject {
    @Published private(set) var isSignedIn = false
    /// True until `restore()` has settled at launch, so the root view can hold a placeholder
    /// rather than flashing the sign-in screen.
    @Published private(set) var isRestoring = true
    @Published private(set) var displayName: String?
    @Published private(set) var email: String?
    @Published private(set) var userId: String?
    @Published private(set) var lastError: String?

    private var tokens: StoredTokens?

    // MARK: - Lifecycle

    /// Restore a previous session at launch. Adopts stored tokens before any network refresh, so
    /// an expired-but-refreshable session opens offline rather than dropping to sign-in.
    func restore() async {
        defer { isRestoring = false }
        guard let stored = try? TokenStore.load() else { return }

        guard stored.expiresAt > Date() || stored.refreshToken != nil else {
            signOut()
            return
        }

        adopt(stored)
        if stored.expiresAt <= Date(), let refreshToken = stored.refreshToken {
            await refresh(using: refreshToken)
        }
    }

    private func adopt(_ stored: StoredTokens) {
        tokens = stored
        isSignedIn = true
        let c = Self.claims(from: stored.idToken)
        displayName = c?["cognito:username"] as? String
        email = c?["email"] as? String
        userId = c?["sub"] as? String
    }

    // MARK: - Public API

    /// Returns a valid ID token, refreshing silently if needed. Signs out only when the session is
    /// genuinely dead (no refresh token, or Cognito rejected it); a network failure returns the
    /// stale token and stays signed in, so the caller's request fails transiently instead.
    func idToken() async -> String? {
        guard let t = tokens else { return nil }
        if t.expiresAt > Date().addingTimeInterval(60) { return t.idToken }
        guard let rt = t.refreshToken else { signOut(); return nil }
        await refresh(using: rt)
        return tokens?.idToken
    }

    func signIn() async {
        lastError = nil
        guard AppConfig.isConfigured else {
            lastError = "This build has no Cognito client id yet (see apple/README.md)."
            return
        }
        let verifier = pkceVerifier()
        let challenge = pkceChallenge(for: verifier)

        var comps = URLComponents(string: "https://\(AppConfig.cognitoLoginDomain)/oauth2/authorize")!
        comps.queryItems = [
            URLQueryItem(name: "response_type",         value: "code"),
            URLQueryItem(name: "client_id",             value: AppConfig.cognitoClientID),
            URLQueryItem(name: "redirect_uri",          value: AppConfig.cognitoRedirectURI),
            URLQueryItem(name: "scope",                 value: "openid email profile"),
            URLQueryItem(name: "code_challenge",        value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]

        do {
            let callback = try await beginSession(url: comps.url!)
            guard let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "code" })?.value
            else { lastError = "No auth code in callback"; return }
            try await exchangeCode(code, verifier: verifier)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signOut() {
        TokenStore.clear()
        tokens = nil
        isSignedIn = false
        displayName = nil
        email = nil
        userId = nil
    }

    // MARK: - Private

    private func beginSession(url: URL) async throws -> URL {
        let scheme = URL(string: AppConfig.cognitoRedirectURI)!.scheme!
        return try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { url, error in
                if let error { cont.resume(throwing: error); return }
                cont.resume(returning: url!)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            session.start()
        }
    }

    private func exchangeCode(_ code: String, verifier: String) async throws {
        var req = URLRequest(url: URL(string: "https://\(AppConfig.cognitoLoginDomain)/oauth2/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = [
            "grant_type":    "authorization_code",
            "client_id":     AppConfig.cognitoClientID,
            "code":          code,
            "redirect_uri":  AppConfig.cognitoRedirectURI,
            "code_verifier": verifier,
        ].formEncoded()

        let (data, _) = try await URLSession.shared.data(for: req)
        try applyTokenResponse(data)
    }

    /// Exchange the refresh token for fresh tokens. Only a genuine Cognito `invalid_grant` signs
    /// the user out; transport failures, 5xx and captive-portal responses keep the credentials.
    @discardableResult
    private func refresh(using refreshToken: String) async -> Bool {
        var req = URLRequest(url: URL(string: "https://\(AppConfig.cognitoLoginDomain)/oauth2/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = [
            "grant_type":    "refresh_token",
            "client_id":     AppConfig.cognitoClientID,
            "refresh_token": refreshToken,
        ].formEncoded()

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (400..<500).contains(status) {
                guard Self.isDeadRefreshToken(data) else { return tokens != nil }
                signOut()
                return false
            }
            guard (200..<300).contains(status) else { return tokens != nil }
            try applyTokenResponse(data, existingRefreshToken: refreshToken)
            return true
        } catch {
            return tokens != nil
        }
    }

    /// Does this body actually say "your refresh token is no longer valid"?
    nonisolated static func isDeadRefreshToken(_ data: Data) -> Bool {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = obj["error"] as? String
        else { return false }
        return error == "invalid_grant"
    }

    private func applyTokenResponse(_ data: Data, existingRefreshToken: String? = nil) throws {
        struct Response: Decodable {
            let access_token: String
            let id_token: String
            let refresh_token: String?
            let expires_in: Int
        }
        let r = try JSONDecoder().decode(Response.self, from: data)
        let stored = StoredTokens(
            accessToken:  r.access_token,
            idToken:      r.id_token,
            refreshToken: r.refresh_token ?? existingRefreshToken,
            expiresAt:    Date().addingTimeInterval(TimeInterval(r.expires_in))
        )
        try TokenStore.save(stored)
        adopt(stored)
    }

    // MARK: - PKCE helpers

    private func pkceVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 64)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }

    private func pkceChallenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded()
    }

    // MARK: - JWT helpers

    nonisolated static func claims(from jwt: String) -> [String: Any]? {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}

extension AuthService: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { ASPresentationAnchor() }
    }
}

// MARK: - Helpers

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private extension [String: String] {
    func formEncoded() -> Data? {
        map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")" }
            .joined(separator: "&")
            .data(using: .utf8)
    }
}
