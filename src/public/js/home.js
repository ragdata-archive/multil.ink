/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

document.querySelector(`#main`).style.display = `block`;

isLoggedIn = (isLoggedIn === `true`);

if (isLoggedIn)
{
    document.querySelector(`#loginHeader`).style.display = `none`;
    document.querySelector(`#registerHeader`).style.display = `none`;
}
else
{
    document.querySelector(`#editProfileHeader`).style.display = `none`;
    document.querySelector(`#logoutHeader`).style.display = `none`;
}

/**
 * @name logout
 * @description Logs the user out
 */
async function logout()
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/logout?_method=DELETE`, {
        type: `POST`,
    });
    window.location.reload();
}
