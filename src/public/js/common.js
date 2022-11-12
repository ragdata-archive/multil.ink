/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

const VER_STATUS = {
    STAFF_MEMBER: 2,
    VERIFIED_MEMBER: 1,
    MEMBER: 0,
    SUSPENDED: -1,
    SHADOW_USER: -2,
    AWAITING_VERIFICATION: -3
};

document.querySelector(`#main`).style.display = `block`;

const alertPlaceholder = document.querySelector(`#liveAlertPlaceholder`);

const alert = (message, type) =>
{
    const wrapper = document.createElement(`div`);
    wrapper.innerHTML = [
        `<div class="alert alert-${ type } alert-dismissible" role="alert">`,
        `   <div>${ message }</div>`,
        `   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`,
        `</div>`
    ].join(``);

    alertPlaceholder.append(wrapper);
};

const message = new URLSearchParams(window.location.search).get(`message`);
let type = new URLSearchParams(window.location.search).get(`type`);
if (type === `error`) type = `danger`;

if (message && type)
    alert(message, type);

const username = new URLSearchParams(window.location.search).get(`username`);
if (username)
{
    document.querySelector(`#username`).value = username;
    document.querySelector(`#email`).focus();
}

for (const form of document.querySelectorAll(`form`))
{
    form.addEventListener(`submit`, () =>
    {
        for (const button of form.querySelectorAll(`button[type=submit]`))
        {
            button.disabled = true;
            button.classList.add(`disabled`);
        }
        for (const inputField of form.querySelectorAll(`input[type=submit]`))
        {
            inputField.disabled = true;
            inputField.classList.add(`disabled`);
        }
    });
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
