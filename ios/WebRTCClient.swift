import Foundation
import CoreMedia
import WebRTC

/**
 * iOS Native WebRTC Client
 * Translates CMSampleBuffer into RTCVideoFrame and communicates with Signaling Server
 */
public class WebRTCClient: NSObject {

    private let sessionId: String
    private var peerConnectionFactory: RTCPeerConnectionFactory!
    private var peerConnection: RTCPeerConnection?
    private var videoSource: RTCVideoSource!
    private var videoTrack: RTCVideoTrack!
    private let signalingUrl = URL(string: "http://localhost:8080")!

    public init(sessionId: String) {
        self.sessionId = sessionId
        super.init()
        RTCInitializeSSL()
        self.peerConnectionFactory = RTCPeerConnectionFactory()
    }

    public func setupPeerConnection() {
        let config = RTCConfiguration()
        config.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"])
        ]
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: ["DtlsSrtpKeyAgreement": "true"])
        self.peerConnection = peerConnectionFactory.peerConnection(with: config, constraints: constraints, delegate: self)

        // Create Custom Video Source & Track
        self.videoSource = peerConnectionFactory.videoSource()
        self.videoTrack = peerConnectionFactory.videoTrack(with: videoSource, trackId: "ScreenShareTrack_iOS")

        self.peerConnection?.add(videoTrack, streamIds: ["LSBScreenShareStream"])

        // Generate SDP Offer
        let sdpConstraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "false",
                "OfferToReceiveVideo": "false"
            ],
            optionalConstraints: nil
        )

        peerConnection?.offer(for: sdpConstraints) { [weak self] sdp, error in
            guard let self = self, let sdp = sdp else { return }
            self.peerConnection?.setLocalDescription(sdp) { _ in
                self.sendOfferToSignaling(sdp: sdp.sdp)
            }
        }
    }

    public func deliverSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let timeStampNs = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1_000_000_000
        let rtcPixelBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let videoFrame = RTCVideoFrame(buffer: rtcPixelBuffer, rotation: ._0, timeStampNs: Int64(timeStampNs))
        videoSource.capturer(RTCVideoCapturer(), didCapture: videoFrame)
    }

    private func sendOfferToSignaling(sdp: String) {
        var request = URLRequest(url: signalingUrl.appendingPathComponent("/api/webrtc/signal/offer"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "sessionId": sessionId,
            "offer": [
                "type": "offer",
                "sdp": sdp
            ]
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request).resume()
    }

    public func disconnect() {
        peerConnection?.close()
        peerConnection = nil
        RTCCleanupSSL()
    }
}

extension WebRTCClient: RTCPeerConnectionDelegate {
    public func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        var request = URLRequest(url: signalingUrl.appendingPathComponent("/api/webrtc/signal/candidate"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "sessionId": sessionId,
            "role": "broadcaster",
            "candidate": [
                "candidate": candidate.sdp,
                "sdpMid": candidate.sdpMid ?? "",
                "sdpMLineIndex": candidate.sdpMLineIndex
            ]
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request).resume()
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    public func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    public func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
