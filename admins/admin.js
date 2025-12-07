document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    if (status == 'update-success'){
        alert("Sucessfully added points.");
    }
    if (status== 'update-failed'){
        alert("Failed to add points to user.")
    }
    if (status == 'delete-success'){
        alert("Sucessfully deleted user");
    }
    if (status == 'delete-failed'){
        alert("Failed to delete user. See console for error message.");
    }
    if (status == 'user-not-found'){
        alert("User is not found");
    }
});