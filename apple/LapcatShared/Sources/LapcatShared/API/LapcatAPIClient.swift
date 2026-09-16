import Foundation

// MARK: - Models

/// Index row for a confirmed swim, as returned by the API.
public struct SwimSummary: Codable, Equatable, Identifiable, Sendable {
    public var swimId: String
    public var startDate: Date
    public var endDate: Date
    public var poolLength: PoolLength
    public var lapCount: Int
    public var distanceMetres: Double
    public var activeDurationSeconds: Double
    public var elapsedDurationSeconds: Double
    public var s3Key: String?
    public var uploadedAt: Date?

    public var id: String { swimId }

    public init(swimId: String, startDate: Date, endDate: Date, poolLength: PoolLength, lapCount: Int,
                distanceMetres: Double, activeDurationSeconds: Double, elapsedDurationSeconds: Double,
                s3Key: String? = nil, uploadedAt: Date? = nil) {
        self.swimId = swimId
        self.startDate = startDate
        self.endDate = endDate
        self.poolLength = poolLength
        self.lapCount = lapCount
        self.distanceMetres = distanceMetres
        self.activeDurationSeconds = activeDurationSeconds
        self.elapsedDurationSeconds = elapsedDurationSeconds
        self.s3Key = s3Key
        self.uploadedAt = uploadedAt
    }
}

public struct UploadURLResponse: Codable, Equatable, Sendable {
    public var uploadUrl: String
    public var key: String
    public var expiresIn: Int
}

public struct SwimDetailResponse: Codable, Equatable, Sendable {
    public var swim: SwimSummary
    public var downloadUrl: String
}

public enum LapcatAPIError: Error, Equatable, LocalizedError {
    /// No ID token available — the user isn't signed in.
    case notAuthenticated
    /// The API rejected the token (401/403).
    case unauthorised
    /// `POST /swims/{id}` found no uploaded object.
    case notUploaded
    /// `POST /swims/{id}` found the object but it failed validation. Retrying won't help.
    case invalidSwim(String?)
    case http(Int, String)
    case invalidResponse

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:     return "Not signed in."
        case .unauthorised:         return "Your session has expired. Please sign in again."
        case .notUploaded:          return "The swim didn't reach the server. It will be retried."
        case .invalidSwim(let d):   return "The server rejected this swim\(d.map { ": \($0)" } ?? ".")"
        case .http(let status, _):  return "Server error (\(status)). Please try again."
        case .invalidResponse:      return "Unexpected response from the server."
        }
    }

    /// Whether retrying the same request later might succeed.
    public var isTransient: Bool {
        switch self {
        case .notUploaded, .invalidResponse: return true
        case .http(let status, _):           return status >= 500 || status == 408 || status == 429
        case .notAuthenticated, .unauthorised, .invalidSwim: return false
        }
    }
}

// MARK: - Protocol used by the uploader

public protocol SwimUploadAPI: Sendable {
    func requestUploadURL(swimId: String) async throws -> UploadURLResponse
    func upload(swimJSON: Data, to url: URL) async throws
    func confirm(swimId: String) async throws -> SwimSummary
}

// MARK: - Client

/// Client for the Lapcat HTTP API. Authenticates with the Cognito **ID token**.
public final class LapcatAPIClient: SwimUploadAPI, @unchecked Sendable {
    public typealias TokenProvider = @Sendable () async -> String?

    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: TokenProvider

    public init(baseURL: URL, session: URLSession = .shared, tokenProvider: @escaping TokenProvider) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    // MARK: Endpoints

    public func requestUploadURL(swimId: String) async throws -> UploadURLResponse {
        let data = try await send(try authorisedRequest(path: "/swims/\(swimId)/upload-url", method: "POST"))
        return try decode(UploadURLResponse.self, from: data)
    }

    /// PUTs the raw swim JSON to the presigned S3 URL. No Authorization header: the URL is the credential.
    public func upload(swimJSON: Data, to url: URL) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = swimJSON
        _ = try await send(request)
    }

    public func confirm(swimId: String) async throws -> SwimSummary {
        let request = try await authorisedRequest(path: "/swims/\(swimId)", method: "POST")
        let (data, status) = try await perform(request)
        switch status {
        case 200..<300:
            return try decode(SwimSummary.self, from: data)
        case 404 where errorCode(in: data) == "not_uploaded":
            throw LapcatAPIError.notUploaded
        case 400 where errorCode(in: data) == "invalid_swim":
            throw LapcatAPIError.invalidSwim(errorDetail(in: data))
        default:
            throw Self.error(forStatus: status, data: data)
        }
    }

    public func listSwims() async throws -> [SwimSummary] {
        struct Response: Decodable { let swims: [SwimSummary] }
        let data = try await send(try await authorisedRequest(path: "/swims", method: "GET"))
        return try decode(Response.self, from: data).swims
    }

    public func getSwim(swimId: String) async throws -> SwimDetailResponse {
        let data = try await send(try await authorisedRequest(path: "/swims/\(swimId)", method: "GET"))
        return try decode(SwimDetailResponse.self, from: data)
    }

    /// Downloads and decodes the full swim JSON from a presigned `downloadUrl`.
    public func downloadRecord(from url: URL) async throws -> SwimRecord {
        let data = try await send(URLRequest(url: url))
        do { return try SwimJSON.decode(data) } catch { throw LapcatAPIError.invalidResponse }
    }

    // MARK: Plumbing

    private func authorisedRequest(path: String, method: String) async throws -> URLRequest {
        guard let token = await tokenProvider(), !token.isEmpty else { throw LapcatAPIError.notAuthenticated }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, Int) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LapcatAPIError.invalidResponse }
        return (data, http.statusCode)
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, status) = try await perform(request)
        guard (200..<300).contains(status) else { throw Self.error(forStatus: status, data: data) }
        return data
    }

    private static func error(forStatus status: Int, data: Data) -> LapcatAPIError {
        if status == 401 || status == 403 { return .unauthorised }
        return .http(status, String(data: data, encoding: .utf8) ?? "")
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do { return try SwimJSON.makeDecoder().decode(type, from: data) } catch { throw LapcatAPIError.invalidResponse }
    }

    private func errorBody(_ data: Data) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func errorCode(in data: Data) -> String? { errorBody(data)?["error"] as? String }

    private func errorDetail(in data: Data) -> String? {
        guard let detail = errorBody(data)?["detail"] else { return nil }
        if let string = detail as? String { return string }
        guard let json = try? JSONSerialization.data(withJSONObject: detail) else { return nil }
        return String(data: json, encoding: .utf8)
    }
}
