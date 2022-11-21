import express from 'express';
import
{
    https,
    projectDescription,
    projectName,
} from '../app.js';

const router = new express.Router();

router.get(`/`, (request, response) =>
{
    const csrfToken = request.csrfToken();
    response.render(`index.ejs`, {
        projectName,
        projectDescription,
        image: `${ https }://${ request.get(`host`) }/img/logo.png`,
        isLoggedIn: request.isAuthenticated(),
        csrfToken,
    });
});

export default router;
