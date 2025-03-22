import express from "express";
import db from "./db.js";
import bodyParser from "body-parser";
import { habitRouter } from "./habits.js";
import { journalRouter } from "./journal.js";
import { userRouter } from "./user.js";
import { authMiddleware } from "./middleware.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const router = express.Router();
router.use("/habits", authMiddleware, habitRouter);
router.use("/journal", authMiddleware, journalRouter);
router.use("/user", userRouter);

router.get("/", authMiddleware, async (req, res) => {
    try {
        const allids = await db.query("SELECT habit_id FROM public.habits");
        allids.rows.forEach(async (habit) => {
            await midnightStreakUpdate(habit.habit_id);
        });

        const habitQuery = `
        SELECT h.*, COALESCE(t.entries, 0) AS entries FROM public.habits h
        LEFT JOIN (
            SELECT habit_id, COUNT(*) AS entries
            FROM public.habit_logs
            WHERE log_date = CURRENT_DATE
            GROUP BY habit_id
        ) t ON h.habit_id = t.habit_id
        ORDER BY h.created_at;`;

        const journalQuery = `
        SELECT *
        FROM journals
        WHERE date = CURRENT_DATE;
    `;

        // db.query("select * from habits;", (err, result) => { //Too simple? wait for some joins
        const habitResult = await db.query(habitQuery);
        const journalResult = await db.query(journalQuery);
        res.status(200).json({
            habits: habitResult.rows,
            journal:
                journalResult.rows.length > 0 ? journalResult.rows[0] : null,
        });
    } catch (err) {
        console.error("Error fetching data:", err);
        res.status(500).send("Error Occurred");
    }
});

const midnightStreakUpdate = async (habitId) => {
    try {
        const query = `SELECT streak, last_log FROM public.habits WHERE habit_id = $1`;
        const data = await db.query(query, [habitId]);
        console.log(data);

        const { streak, last_log } = data.rows[0];
        const today = new Date();
        const lastLog = new Date(last_log);
        const differenceInDays = Math.floor(
            (today - lastLog) / (1000 * 60 * 60 * 24)
        );
        let newStreak = streak;
        if (streak > 0) {
            if (differenceInDays > 1) {
                newStreak = 0;
                const streakQuery = `UPDATE public.habits SET streak = $1 WHERE habit_id = $2;`;
                db.query(streakQuery, [newStreak, habitId]);
            }
        }
    } catch (err) {
        console.error("Error in MidNight streak update:", err);
        res.status(500).json({
            error: "Error occurred while updating streak.",
        });
    }
};

export { router };
