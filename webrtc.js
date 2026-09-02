/**
 * Prabhu Bank Screen Sharing WebRTC & Signaling Engine
 * Complies with Mobile Screen Sharing Technical Implementation Specification
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PrabhuWebRTC = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Helper: check if browser screen capture API is supported
  function canShareScreen() {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
  }

  /**
   * ScreenShareBroadcaster (Presenter / Sharer)
   */
  class ScreenShareBroadcaster {
    constructor(options = {}) {
      this.sessionId = options.sessionId || null;
      this.iceServers = options.iceServers || DEFAULT_ICE_SERVERS;
      this.onStateChange = options.onStateChange || (() => {});
      this.onError = options.onError || (() => {});
      
      this.peerConnection = null;
      this.localStream = null;
      this.pollingTimer = null;
      this.candidatesSince = 0;
      this.isBroadcasting = false;
    }

    /**
     * Creates a new session on the signaling backend
     */
    async createSession(metadata = {}) {
      try {
        const res = await fetch('/api/webrtc/session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creatorId: 'customer_portal', ...metadata })
        });
        const data = await res.json();
        if (data.status === 'success') {
          this.sessionId = data.sessionId;
          if (data.stunServers && data.stunServers.length) {
            this.iceServers = data.stunServers;
          }
          return this.sessionId;
        } else {
          throw new Error(data.message || 'Failed to create session');
        }
      } catch (err) {
        this.onError('Session creation failed: ' + err.message);
        throw err;
      }
    }

    /**
     * Prompts the user to select screen to share, sets up WebRTC and sends offer
     */
    async startCapture(options = {}) {
      if (!canShareScreen()) {
        const err = new Error('Browser screen sharing is not supported on this device. Please use the mobile application.');
        err.code = 'UNSUPPORTED';
        this.onError(err.message);
        throw err;
      }

      try {
        this.onStateChange('requesting_permission');
        
        // Explicit user action trigger: native browser prompt
        this.localStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: options.displaySurface || 'monitor'
          },
          audio: options.audio || false
        });

        this.onStateChange('permission_granted');

        // Handle track ended by browser's native UI (e.g. "Stop sharing" floating bar)
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', () => {
            console.log('[WebRTC] Local video track ended by user');
            this.stop();
          });
        }

        // Initialize PeerConnection
        if (!this.sessionId) {
          await this.createSession();
        }

        this.initPeerConnection();
        this.isBroadcasting = true;
        this.onStateChange('connecting');

        // Add stream tracks to WebRTC
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });

        // Create & dispatch SDP offer
        const offer = await this.peerConnection.createOffer({
          offerToReceiveVideo: false,
          offerToReceiveAudio: false
        });
        await this.peerConnection.setLocalDescription(offer);

        await fetch('/api/webrtc/signal/offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.sessionId,
            offer: { type: offer.type, sdp: offer.sdp }
          })
        });

        this.onStateChange('waiting_for_viewer');

        // Start polling for answer and viewer ICE candidates
        this.startSignalingPoll();

        return { sessionId: this.sessionId, stream: this.localStream };
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          this.onStateChange('permission_denied');
        } else {
          this.onError('Capture error: ' + err.message);
        }
        throw err;
      }
    }

    initPeerConnection() {
      this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          fetch('/api/webrtc/signal/candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: this.sessionId,
              role: 'broadcaster',
              candidate: event.candidate.toJSON()
            })
          }).catch(e => console.warn('ICE candidate send err:', e));
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        console.log('[Broadcaster] WebRTC Connection State:', state);
        if (state === 'connected') {
          this.onStateChange('connected');
        } else if (state === 'disconnected' || state === 'failed') {
          this.onStateChange('disconnected');
        } else if (state === 'closed') {
          this.onStateChange('closed');
        }
      };
    }

    startSignalingPoll() {
      if (this.pollingTimer) clearInterval(this.pollingTimer);

      this.pollingTimer = setInterval(async () => {
        if (!this.isBroadcasting || !this.sessionId) return;

        try {
          // Check for viewer answer if not set
          if (this.peerConnection && !this.peerConnection.remoteDescription) {
            const res = await fetch(`/api/webrtc/signal/answer?sessionId=${encodeURIComponent(this.sessionId)}`);
            if (res.ok) {
              const data = await res.json();
              if (data.answer && data.answer.sdp) {
                console.log('[Broadcaster] Received SDP answer from viewer');
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                this.onStateChange('connected');
              }
            }
          }

          // Fetch pending candidates from viewer
          if (this.peerConnection && this.peerConnection.remoteDescription) {
            const candRes = await fetch(`/api/webrtc/signal/candidates?sessionId=${encodeURIComponent(this.sessionId)}&role=broadcaster&since=${this.candidatesSince}`);
            if (candRes.ok) {
              const candData = await candRes.json();
              if (candData.candidates && candData.candidates.length) {
                for (const cand of candData.candidates) {
                  try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {
                    console.warn('Add ICE candidate err:', e);
                  }
                }
                this.candidatesSince = candData.total;
              }
            }
          }
        } catch (pollErr) {
          console.warn('Broadcaster polling error:', pollErr);
        }
      }, 1200);
    }

    /**
     * Stop sharing and clean up all resources
     */
    async stop() {
      this.isBroadcasting = false;
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      if (this.sessionId) {
        fetch('/api/webrtc/session/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId })
        }).catch(() => {});
      }

      this.onStateChange('ended');
    }
  }

  /**
   * ScreenShareViewer (Remote Viewer / Admin Console)
   */
  class ScreenShareViewer {
    constructor(options = {}) {
      this.sessionId = options.sessionId || null;
      this.videoElement = options.videoElement || null;
      this.iceServers = options.iceServers || DEFAULT_ICE_SERVERS;
      this.onStateChange = options.onStateChange || (() => {});
      this.onError = options.onError || (() => {});

      this.peerConnection = null;
      this.pollingTimer = null;
      this.candidatesSince = 0;
      this.isViewing = false;
      this.remoteStream = null;
      this.hasAnswered = false;
    }

    async join(sessionId) {
      this.sessionId = sessionId || this.sessionId;
      if (!this.sessionId) {
        throw new Error('Session ID is required to join');
      }

      this.isViewing = true;
      this.onStateChange('connecting', 'Connecting to device...');

      this.initPeerConnection();
      this.startViewerPoll();
    }

    initPeerConnection() {
      this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

      // Incoming stream handling
      this.peerConnection.ontrack = (event) => {
        console.log('[Viewer] Incoming video track received:', event.track);
        this.remoteStream = event.streams[0];
        if (this.videoElement) {
          this.videoElement.srcObject = this.remoteStream;
          this.videoElement.play().catch(e => console.warn('Video play prevented:', e));
        }
        this.onStateChange('connected', 'Screen sharing active');
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          fetch('/api/webrtc/signal/candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: this.sessionId,
              role: 'viewer',
              candidate: event.candidate.toJSON()
            })
          }).catch(e => console.warn('Viewer ICE send err:', e));
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        console.log('[Viewer] PeerConnection state:', state);
        if (state === 'connected') {
          this.onStateChange('connected', 'Screen sharing active');
        } else if (state === 'disconnected') {
          this.onStateChange('disconnected', 'Screen sharing disconnected');
        } else if (state === 'failed') {
          this.onStateChange('failed', 'Connection failed');
        } else if (state === 'closed') {
          this.onStateChange('ended', 'The user stopped screen sharing');
        }
      };
    }

    startViewerPoll() {
      if (this.pollingTimer) clearInterval(this.pollingTimer);

      this.pollingTimer = setInterval(async () => {
        if (!this.isViewing || !this.sessionId) return;

        try {
          // Check session status
          const statusRes = await fetch(`/api/webrtc/session?sessionId=${encodeURIComponent(this.sessionId)}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.sessionStatus === 'ended') {
              this.stop('The user stopped screen sharing');
              return;
            }
          }

          // If we haven't answered yet, look for offer
          if (!this.hasAnswered) {
            const offerRes = await fetch(`/api/webrtc/signal/offer?sessionId=${encodeURIComponent(this.sessionId)}`);
            if (offerRes.ok) {
              const offerData = await offerRes.json();
              if (offerData.offer && offerData.offer.sdp) {
                console.log('[Viewer] Received SDP offer from broadcaster');
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));

                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);

                await fetch('/api/webrtc/signal/answer', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: this.sessionId,
                    answer: { type: answer.type, sdp: answer.sdp }
                  })
                });

                this.hasAnswered = true;
                console.log('[Viewer] Sent SDP answer to signaling server');
              } else {
                this.onStateChange('waiting', 'Waiting for the user to start screen sharing...');
              }
            }
          }

          // Fetch broadcaster ICE candidates
          if (this.hasAnswered) {
            const candRes = await fetch(`/api/webrtc/signal/candidates?sessionId=${encodeURIComponent(this.sessionId)}&role=viewer&since=${this.candidatesSince}`);
            if (candRes.ok) {
              const candData = await candRes.json();
              if (candData.candidates && candData.candidates.length) {
                for (const cand of candData.candidates) {
                  try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {
                    console.warn('Add broadcaster candidate err:', e);
                  }
                }
                this.candidatesSince = candData.total;
              }
            }
          }
        } catch (err) {
          console.warn('Viewer polling err:', err);
        }
      }, 1200);
    }

    async stop(reason = 'Session ended') {
      this.isViewing = false;
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }

      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }

      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      if (this.sessionId) {
        fetch('/api/webrtc/session/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId })
        }).catch(() => {});
      }

      this.onStateChange('ended', reason);
    }
  }

  return {
    canShareScreen,
    ScreenShareBroadcaster,
    ScreenShareViewer
  };
}));
