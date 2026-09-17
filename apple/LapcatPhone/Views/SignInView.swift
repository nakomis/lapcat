import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var sync: PhoneSyncService
    @State private var signingIn = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 4) {
                Text("Lapcat")
                    .font(.largeTitle.bold())
                Text(Bundle.main.versionLabel)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Text("Every length, counted and kept.")
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            }

            if sync.pendingCount > 0 {
                Label("\(sync.pendingCount) swim\(sync.pendingCount == 1 ? "" : "s") waiting to upload — sign in to sync",
                      systemImage: "icloud.and.arrow.up")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer()

            if let error = auth.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Button {
                signingIn = true
                Task {
                    await auth.signIn()
                    signingIn = false
                }
            } label: {
                Group {
                    if signingIn { ProgressView() } else { Text("Sign In") }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.accentColor)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(signingIn)
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        // Keep the sign-in column phone-width on iPad rather than a full-width button.
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity)
    }
}
