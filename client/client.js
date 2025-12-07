document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');

    if (status === 'signup_success'){
        alert("Profile Created!");
    }
    if (status === 'signup_failed'){
        alert("Profile already exists.");
    }
    if (status == 'signin_failed'){
        alert("Profile does not exist. Please sign up.");
    }
    if (status == 'failed'){
        alert("Incorrect Username or Password");
    }
    if (status == 'access_denied'){
        alert("Access Denied");
    }

    if (status == 'error_session_save'){
        alert("Error in saving cookie");
    }
});