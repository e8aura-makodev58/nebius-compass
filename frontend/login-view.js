/**
 * Login view for shared-password guest workplaces.
 * Spec: docs/design/guest-workplaces.md §1, §8.
 */

export function initLoginView({
  viewElement,
  onLoginSuccess,
  apiCall = defaultApiCall,
}) {
  const form = viewElement.querySelector("#login-form");
  const usernameInput = viewElement.querySelector("#login-username");
  const passwordInput = viewElement.querySelector("#login-password");
  const errorElement = viewElement.querySelector("#login-error");
  const submitButton = viewElement.querySelector("#login-submit-button");
  const defaultLabel = submitButton ? submitButton.querySelector(".login-submit-label") : null;
  const busyLabel = submitButton ? submitButton.querySelector(".login-submit-busy") : null;

  function setBusy(busy) {
    if (busy) {
      form.setAttribute("aria-busy", "true");
      usernameInput.disabled = true;
      passwordInput.disabled = true;
      submitButton.disabled = true;
      if (defaultLabel) defaultLabel.hidden = true;
      if (busyLabel) busyLabel.hidden = false;
    } else {
      form.removeAttribute("aria-busy");
      usernameInput.disabled = false;
      passwordInput.disabled = false;
      submitButton.disabled = false;
      if (defaultLabel) defaultLabel.hidden = false;
      if (busyLabel) busyLabel.hidden = true;
    }
  }

  function showError(message) {
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.hidden = false;
  }

  function clearError() {
    if (!errorElement) return;
    errorElement.textContent = "";
    errorElement.hidden = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError("Please enter both username and password.");
      if (!username) usernameInput.focus();
      else passwordInput.focus();
      return;
    }

    clearError();
    setBusy(true);

    try {
      const response = await apiCall("/session/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      setBusy(false);
      if (onLoginSuccess) {
        onLoginSuccess(response);
      }
    } catch (error) {
      setBusy(false);
      // Requirement: one error line for a wrong password or a refused login (never say which field was wrong)
      // and a 429 message that says to wait.
      if (error.status === 429) {
        showError("Too many failed login attempts. Please wait before trying again.");
      } else if (error.status === 503) {
        showError("Workplace capacity reached. Please try again later.");
      } else {
        showError("Invalid username or password.");
      }
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  return {
    show() {
      viewElement.hidden = false;
      document.title = "Sign In — ResponseCompass";
      clearError();
      setBusy(false);
      usernameInput.focus();
    },
    hide() {
      viewElement.hidden = true;
      clearError();
      setBusy(false);
      usernameInput.value = "";
      passwordInput.value = "";
    },
    reset() {
      clearError();
      setBusy(false);
      usernameInput.value = "";
      passwordInput.value = "";
    },
  };
}

async function defaultApiCall(path, options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    credentials: "same-origin",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error ?? "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return response.json();
}
