import express, { query } from "express";
import db from "./db.js";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config.js";
import { authMiddleware } from "./middleware.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const router = express.Router();

const saltRounds = 10;
router.post("/register", async (req, res) => {
    const { newUser } = req.body;
    console.log(newUser);

    try {
        const usernameCheck = await db.query(
            "SELECT username FROM public.users where username = $1;",
            [newUser.username]
        );
        if (usernameCheck.rows.length > 0) {
            return res.status(409).send("Username already taken");
        }
        console.log(usernameCheck);
        const emailCheck = await db.query(
            "SELECT email FROM public.users where email = $1;",
            [newUser.email]
        );
        if (emailCheck.rows.length > 0) {
            return res.status(409).send("User with this email already exists");
        }
        console.log(emailCheck);

        const hashedPassowrd = await bcrypt.hash(newUser.password, saltRounds);
        console.log(hashedPassowrd);

        db.query(
            "INSERT INTO public.users(username, email, password) VALUES ($1, $2, $3);",
            [newUser.username, newUser.email, hashedPassowrd],
            (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(409).send("Error occured while creating user.");
                } else {
                    console.log(result);
                    res.status(201).send("User created successfully.");
                }
            }
        );
    } catch (err) {
        console.log(err);
        res.status(409).send("Error occured while creating user.");
    }
});

router.post("/signin", async (req, res) => {
    const { user } = req.body;
    let field = "username";
    try {
        if (user.username.includes("@")) {
            field = "email";
        }
        const userResult = await db.query(
            `SELECT * from public.users where ${field} = $1`,
            [user.username]
        );
        console.log(userResult);
        if (userResult.rows.length === 0) {
            return res.status(401).send("Invalid email or password");
        }

        const dbUser = userResult.rows[0];

        const isMatch = await bcrypt.compare(user.password, dbUser.password);

        if (!isMatch) {
            return res.status(401).send("Invalid email or password");
        }

        const token = jwt.sign(
            { userId: dbUser.id, username: dbUser.username },
            JWT_SECRET,
            { expiresIn: "2h" }
        );

        // const refreshToken = jwt.sign({ userId: dbUser.id }, JWT_SECRET, {
        //     expiresIn: "15d",
        // });

        // await db.query("UPDATE users SET refresh_token = $1 WHERE id = $2;", [
        //     refreshToken,
        //     dbUser.id,
        // ]);

        res.status(200).json({
            message: "Login successful.",

            token,
            user: {
                id: dbUser.id,
                username: dbUser.username,
                email: dbUser.email,
            },
            theme: dbUser.theme,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error.");
    }
});

router.post("/theme", authMiddleware, async (req, res) => {
    const { id, theme } = req.body;
    console.log(id, theme);
    try {
        await db.query("UPDATE public.users SET theme = $1 WHERE id = $2;", [
            theme,
            id,
        ]);
        res.status(201).json({
            message: "Theme changed successfully.",
        });
    } catch {
        console.error(err);
        res.status(500).send("Server error.");
    }
});

// router.post("/refresh", async (req, res) => {
//     const { token } = req.body;

//     if (!token) {
//         return res.status(401).send("Refresh token is required");
//     }

//     try {
//         const decoded = jwt.verify(token, JWT_SECRET);

//         const userResult = await db.query(
//             "SELECT * FROM users where id = $1 and refresh_token = $2",
//             [decoded.userId, token]
//         );

//         if (userResult.rows.length === 0) {
//             return res.status(401).send("Invalid refresh token");
//         }

//         const accessToken = jwt.sign(
//             { userId: decoded.userId, username: decoded.username },
//             JWT_SECRET,
//             { expiresIn: "15m" }
//         );
//         res.status(200).json({ accessToken });
//     } catch (err) {
//         console.log(err);
//         res.status.apply(403).send("Invalid or expired refresh token");
//     }
// });

export { router as userRouter };
