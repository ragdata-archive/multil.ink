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
    response.render(`privacy.ejs`, {
        projectName,
        projectDescription,
        ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`,
    });
});

export default router;
