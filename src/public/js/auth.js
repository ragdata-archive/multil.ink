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
