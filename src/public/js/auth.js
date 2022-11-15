/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

// Allows /register?username=asdf to work
const username = new URLSearchParams(window.location.search).get(`username`);
if (username)
{
    document.querySelector(`#username`).value = username;
    document.querySelector(`#email`).focus();
}
