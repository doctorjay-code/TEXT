// ==========================================================================
// 서재 보안 인증 제어 모듈 (auth.js)
// ==========================================================================

(function() {
  let authSuccessCallbackFn = null;

  const authState = {
    failedAttempts: parseInt(localStorage.getItem('reader_failed_attempts') || '0', 10),
    lockoutUntil: parseInt(localStorage.getItem('reader_lockout_until') || '0', 10),
    lockoutInterval: null
  };

  async function hashString(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function startLockoutTimer(untilTime) {
    const input = document.getElementById('authPasswordInput');
    const submit = document.getElementById('authSubmitBtn');
    const error = document.getElementById('authErrorMsg');
    const timer = document.getElementById('authLockoutTimer');

    if (input) input.disabled = true;
    if (submit) submit.disabled = true;
    if (timer) timer.classList.remove('hidden');

    if (authState.lockoutInterval) clearInterval(authState.lockoutInterval);

    authState.lockoutInterval = setInterval(() => {
      const remaining = untilTime - Date.now();
      if (remaining <= 0) {
        clearInterval(authState.lockoutInterval);
        authState.failedAttempts = 0;
        authState.lockoutUntil = 0;
        localStorage.removeItem('reader_failed_attempts');
        localStorage.removeItem('reader_lockout_until');

        if (input) input.disabled = false;
        if (submit) submit.disabled = false;
        if (timer) timer.classList.add('hidden');
        if (error) {
          error.textContent = '';
          error.classList.add('hidden');
        }
        return;
      }

      if (timer) {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timer.textContent = `접속이 일시 차단되었습니다 (${minutes}분 ${seconds}초 남)`;
      }
    }, 1000);
  }

  async function handleAuthSubmit() {
    const overlay = document.getElementById('authModalOverlay');
    const input = document.getElementById('authPasswordInput');
    const error = document.getElementById('authErrorMsg');

    if (!input || authState.lockoutUntil > Date.now()) return;

    const enteredPassword = input.value.trim();
    if (!enteredPassword) {
      if (error) {
        error.textContent = '비밀번호를 입력해주세요.';
        error.classList.remove('hidden');
      }
      return;
    }

    let enteredHash;
    try {
      enteredHash = await hashString(enteredPassword);
    } catch (hashError) {
      console.error('Password hash failed:', hashError);
      if (error) {
        error.textContent = '비밀번호를 확인할 수 없습니다. localhost 또는 HTTPS 환경에서 접속해주세요.';
        error.classList.remove('hidden');
      }
      return;
    }

    const profiles = window.AUTH_PROFILES || {};
    let matchedProfile = null;

    for (const key of Object.keys(profiles)) {
      if (profiles[key].hash.toLowerCase() === enteredHash.toLowerCase()) {
        matchedProfile = profiles[key];
        break;
      }
    }

    if (matchedProfile) {
      // 인증 성공
      sessionStorage.setItem('reader_authenticated', 'true');
      sessionStorage.setItem('reader_auth_profile', matchedProfile.id);

      authState.failedAttempts = 0;
      localStorage.removeItem('reader_failed_attempts');
      input.value = '';

      if (error) {
        error.textContent = '';
        error.classList.add('hidden');
      }

      if (overlay) {
        overlay.classList.remove('active');
      }

      try {
        if (typeof authSuccessCallbackFn === 'function') {
          await authSuccessCallbackFn(matchedProfile);
        }
      } catch (err) {
        console.error('Auth success callback failed:', err);
      }
      return;
    }

    // 비밀번호 불일치
    authState.failedAttempts += 1;
    localStorage.setItem('reader_failed_attempts', String(authState.failedAttempts));

    if (authState.failedAttempts >= 10) {
      authState.lockoutUntil = Date.now() + 5 * 60 * 1000;
      localStorage.setItem('reader_lockout_until', String(authState.lockoutUntil));
      if (error) {
        error.textContent = '입력 오류가 누적되어 5분간 접속이 차단되었습니다.';
        error.classList.remove('hidden');
      }
      startLockoutTimer(authState.lockoutUntil);
    } else {
      if (error) {
        error.textContent = `비밀번호가 올바르지 않습니다. (오류: ${authState.failedAttempts}/10)`;
        error.classList.remove('hidden');
      }
    }
  }

  function logout() {
    sessionStorage.removeItem('reader_authenticated');
    sessionStorage.removeItem('reader_auth_profile');
    window.location.reload();
  }

  function getAuthenticatedProfile() {
    const isAuthed = sessionStorage.getItem('reader_authenticated') === 'true';
    if (!isAuthed) return null;
    const profileId = sessionStorage.getItem('reader_auth_profile');
    return (window.AUTH_PROFILES && window.AUTH_PROFILES[profileId]) || null;
  }

  function initSecurityAuth(onSuccess) {
    authSuccessCallbackFn = onSuccess;

    const overlay = document.getElementById('authModalOverlay');
    const input = document.getElementById('authPasswordInput');
    const submit = document.getElementById('authSubmitBtn');

    if (!overlay || !input || !submit) {
      console.warn('Auth modal elements not found');
      return false;
    }

    const currentProfile = getAuthenticatedProfile();
    if (currentProfile) {
      overlay.classList.remove('active');
      if (typeof authSuccessCallbackFn === 'function') {
        authSuccessCallbackFn(currentProfile);
      }
    } else {
      overlay.classList.add('active');
      setTimeout(() => input.focus(), 100);
    }

    if (authState.lockoutUntil > Date.now()) {
      startLockoutTimer(authState.lockoutUntil);
    }

    submit.addEventListener('click', handleAuthSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAuthSubmit();
      }
    });

    return true;
  }

  window.TextReaderAuth = {
    init: initSecurityAuth,
    getProfile: getAuthenticatedProfile,
    logout: logout,
    hashString: hashString
  };
})();
