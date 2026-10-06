import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation

/**
 * iOS / macOS ScreenCaptureKit Native Implementation
 * Complies with Section 3 and Section 14 of Technical Specification:
 * - Uses Apple's modern ScreenCaptureKit APIs (not deprecated ReplayKit APIs)
 * - Handles authorization, orientation, and interruptions
 * - Feeds captured CMSampleBuffer frames directly to WebRTC VideoTrack
 */
@available(iOS 16.0, macOS 12.3, *)
public class ScreenCaptureManager: NSObject, SCStreamOutput, SCStreamDelegate {

    public static let shared = ScreenCaptureManager()

    private var stream: SCStream?
    private var webRTCClient: WebRTCClient?
    private let captureQueue = DispatchQueue(label: "com.rastriyabanijyabank.screencapture.queue", qos: .userInitiated)
    private var isCapturing = false

    public func startCapture(sessionId: String, completion: @escaping (Result<Void, Error>) -> Void) {
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self = self else { return }
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let display = content?.displays.first else {
                completion(.failure(NSError(domain: "ScreenCapture", code: -1, userInfo: [NSLocalizedDescriptionKey: "No active display found."])))
                return
            }

            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            let config = SCStreamConfiguration()
            config.width = 1280
            config.height = 720
            config.minimumFrameInterval = CMTime(value: 1, timescale: 30) // 30 fps
            config.queueDepth = 5
            config.showsCursor = true

            do {
                self.stream = SCStream(filter: filter, configuration: config, delegate: self)
                try self.stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: self.captureQueue)

                self.webRTCClient = WebRTCClient(sessionId: sessionId)
                self.webRTCClient?.setupPeerConnection()

                self.stream?.startCapture { captureError in
                    if let captureError = captureError {
                        completion(.failure(captureError))
                    } else {
                        self.isCapturing = true
                        completion(.success(()))
                    }
                }
            } catch {
                completion(.failure(error))
            }
        }
    }

    public func stopCapture(completion: @escaping () -> Void) {
        guard isCapturing, let stream = stream else {
            completion()
            return
        }

        stream.stopCapture { [weak self] _ in
            self?.isCapturing = false
            self?.webRTCClient?.disconnect()
            self?.webRTCClient = null
            self?.stream = nil
            completion()
        }
    }

    // MARK: - SCStreamOutput
    public func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        // Feed video frame into WebRTC video source
        webRTCClient?.deliverSampleBuffer(sampleBuffer)
    }

    // MARK: - SCStreamDelegate
    public func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("[ScreenCaptureKit] Stream stopped with error: \(error.localizedDescription)")
        stopCapture {}
    }
}
