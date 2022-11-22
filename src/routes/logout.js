import express from "express";
import { logoutUser } from "../functions.js";

const router = new express.Router();

router.post(`/`, (request, response, next) =>
{
    logoutUser(request, response, next);
    return response.redirect(`/login`);
});

export default router;
