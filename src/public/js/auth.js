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

// grab message from query string
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

// on submit of a form, try and disable the submit button to prevent double submits
for (const form of document.querySelectorAll(`form`))
{
    form.addEventListener(`submit`, () =>
    {
        for (const button of form.querySelectorAll(`button[type=submit]`))
        {
            button.disabled = true;
            button.classList.add(`disabled`);
        }
        // also do this for any input buttons submit
        for (const button of form.querySelectorAll(`input[type=submit]`))
        {
            button.disabled = true;
            button.classList.add(`disabled`);
        }
    });
}
