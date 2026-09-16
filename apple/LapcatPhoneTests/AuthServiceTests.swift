import XCTest
@testable import Lapcat

/// Deciding whether a 4xx from the Cognito token endpoint really means the refresh token is dead
/// (same rules as Recipator, RECP-58): only a JSON `invalid_grant` may sign the user out.
final class AuthServiceTests: XCTestCase {

    private func body(_ s: String) -> Data { Data(s.utf8) }

    func testCognitoInvalidGrantIsDead() {
        XCTAssertTrue(AuthService.isDeadRefreshToken(body(#"{"error":"invalid_grant"}"#)))
        XCTAssertTrue(AuthService.isDeadRefreshToken(
            body(#"{"error":"invalid_grant","error_description":"Refresh Token has expired"}"#)))
    }

    func testCaptivePortalAndOtherErrorsAreNotDead() {
        XCTAssertFalse(AuthService.isDeadRefreshToken(body("<html>Sign in to pool Wi-Fi</html>")))
        XCTAssertFalse(AuthService.isDeadRefreshToken(body("")))
        XCTAssertFalse(AuthService.isDeadRefreshToken(body(#"{"message":"Forbidden"}"#)))
        XCTAssertFalse(AuthService.isDeadRefreshToken(body(#"[{"error":"invalid_grant"}]"#)))
        for code in ["invalid_request", "invalid_client", "slow_down"] {
            XCTAssertFalse(AuthService.isDeadRefreshToken(body(#"{"error":"\#(code)"}"#)))
        }
    }

    func testJWTClaimsDecodeBase64URL() {
        // {"sub":"abc-123","email":"swimmer@example.com","cognito:username":"swimmer"}
        let payload = Data(#"{"sub":"abc-123","email":"swimmer@example.com","cognito:username":"swimmer"}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let claims = AuthService.claims(from: "header.\(payload).signature")
        XCTAssertEqual(claims?["sub"] as? String, "abc-123")
        XCTAssertEqual(claims?["cognito:username"] as? String, "swimmer")
        XCTAssertNil(AuthService.claims(from: "not-a-jwt"))
    }

    func testConfigIsBakedIntoInfoPlist() {
        XCTAssertTrue(AppConfig.apiBaseURL.hasPrefix("https://api.lapcat."))
        XCTAssertEqual(AppConfig.cognitoRedirectURI, "com.nakomis.lapcat://callback")
        XCTAssertFalse(AppConfig.cognitoLoginDomain.isEmpty)
    }

    func testPendingAcksDeduplicateAndDrain() {
        _ = PendingAcks.drain()
        PendingAcks.add("a")
        PendingAcks.add("a")
        PendingAcks.add("b")
        XCTAssertEqual(PendingAcks.drain(), ["a", "b"])
        XCTAssertEqual(PendingAcks.drain(), [])
    }
}
