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

// User has JS enabled, so let's show them the page.
document.querySelector(`#main`).style.display = `block`;

// Allows alerts to be shown.
const alertPlaceholder = document.querySelector(`#liveAlertPlaceholder`);
const alert = (message, type) =>
{
    message = escape(message.toString());
    type = escape(type.toString());
    message = message.replace(/%20/g, ` `);
    message = message.replace(/%2C/g, `,`);
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

// When you submit any form, disable the submit button to prevent double submission.
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
    // inject CSRF token into form
    const csrfInput = document.createElement(`input`);
    csrfInput.setAttribute(`type`, `hidden`);
    csrfInput.setAttribute(`name`, `_csrf`);
    csrfInput.setAttribute(`value`, `${ csrfToken }`);
    form.append(csrfInput);
}

/**
 * @name darkMode
 * @description Adds the dark mode class to the dropdown menu
 * @param {string} dark if user is using dark
 */
function darkMode(dark)
{
    if (dark === `dark`)
    {
        document.body.classList.add(`bg-dark`);
        document.documentElement.classList.add(`bg-dark`);
        const dropdowns = document.querySelectorAll(`.dropdown-menu`);
        for (const dropdown of dropdowns)
            dropdown.classList.add(`dropdown-menu-dark`);
        const reactiveToColors = document.querySelectorAll(`.reactiveToColor`);
        for (const reactiveToColor of reactiveToColors)
        {
            reactiveToColor.classList.add(`bg-dark`);
            reactiveToColor.classList.remove(`bg-light`);
        }
        const tables = document.querySelectorAll(`table`);
        for (const table of tables)
        {
            table.classList.add(`table-dark`);
            table.classList.remove(`table-light`);
        }
        const textBlack = document.querySelectorAll(`.text-black`);
        for (const text of textBlack)
        {
            text.classList.remove(`text-black`);
            text.classList.add(`text-white`);
        }
        const navbars = document.querySelectorAll(`.navbar`);
        for (const navbar of navbars)
        {
            navbar.classList.add(`navbar-dark`);
            navbar.classList.add(`bg-dark`);
            navbar.classList.remove(`navbar-light`);
            navbar.classList.remove(`bg-light`);
        }
        const navbarDropdowns = document.querySelectorAll(`.navbar-collapse`);
        for (const navbarDropdown of navbarDropdowns)
        {
            navbarDropdown.classList.add(`bg-dark`);
            navbarDropdown.classList.add(`navbar-dark`);
            navbarDropdown.classList.remove(`bg-light`);
            navbarDropdown.classList.remove(`navbar-light`);
        }
        const cards = document.querySelectorAll(`.card`);
        for (const card of cards)
        {
            card.classList.add(`bg-dark`);
            card.classList.remove(`bg-light`);
        }
    }
    else
    {
        document.body.classList.remove(`bg-dark`);
        document.documentElement.classList.remove(`bg-dark`);
        const dropdowns = document.querySelectorAll(`.dropdown-menu`);
        for (const dropdown of dropdowns)
            dropdown.classList.remove(`dropdown-menu-dark`);
        const reactiveToColors = document.querySelectorAll(`.reactiveToColor`);
        for (const reactiveToColor of reactiveToColors)
        {
            reactiveToColor.classList.add(`bg-light`);
            reactiveToColor.classList.remove(`bg-dark`);
        }
        const tables = document.querySelectorAll(`table`);
        for (const table of tables)
        {
            table.classList.add(`table-light`);
            table.classList.remove(`table-dark`);
        }
        const textWhite = document.querySelectorAll(`.text-white`);
        for (const text of textWhite)
        {
            text.classList.add(`text-black`);
            text.classList.remove(`text-white`);
        }
        const navbars = document.querySelectorAll(`.navbar`);
        for (const navbar of navbars)
        {
            navbar.classList.remove(`navbar-dark`);
            navbar.classList.remove(`bg-dark`);
            navbar.classList.add(`navbar-light`);
            navbar.classList.add(`bg-light`);
        }
        const navbarDropdowns = document.querySelectorAll(`.navbar-collapse`);
        for (const navbarDropdown of navbarDropdowns)
        {
            navbarDropdown.classList.remove(`navbar-dark`);
            navbarDropdown.classList.remove(`bg-dark`);
            navbarDropdown.classList.add(`bg-light`);
            navbarDropdown.classList.add(`navbar-light`);
        }
        const cards = document.querySelectorAll(`.card`);
        for (const card of cards)
        {
            card.classList.remove(`bg-dark`);
            card.classList.add(`bg-light`);
        }
    }
}

window.matchMedia(`(prefers-color-scheme: dark)`).addEventListener(`change`, (event) =>
{
    const colorScheme = event.matches ? `dark` : `light`;
    darkMode(colorScheme);
});
darkMode(window.matchMedia(`(prefers-color-scheme: dark)`).matches ? `dark` : `light`);

/**
 * @name logout
 * @description Logs the user out
 */
async function logout()
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/logout`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            _csrf: csrfToken
        }),
    });
    window.location.reload();
}
