/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

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
