import express from "express";
import db from "./db.js";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const router = express.Router();

router.post("/entry", async (req, res) => {
    const { journalEntry, userId } = req.body;

    try {
        const prevEntry = await db.query(
            "SELECT journal_id FROM public.journals where date = CURRENT_DATE AND user_id = $1;",
            [userId]
        );
        if (prevEntry.rows.length > 0) {
            //entry exists
            const updateJournal = `UPDATE public.journals
            SET content = $1, updated_at = CURRENT_TIMESTAMP
            WHERE journal_id = $2
            RETURNING *;
            `;
            const updatedJournal = await db.query(updateJournal, [
                journalEntry,
                prevEntry.rows[0].journal_id,
            ]);
            return res.status(200).json({
                message: "Journal updated.",
                entry: updatedJournal.rows[0],
            });
        } else {
            const createJournal = `INSERT INTO public.journals(content, date, user_id)
            VALUES($1, CURRENT_DATE, $2)
            RETURNING *;
            `;
            const newEntry = await db.query(createJournal, [
                journalEntry,
                userId,
            ]);

            return res.status(201).json({
                message: "Journal created.",
                entry: newEntry.rows[0],
            });
        }
    } catch (err) {
        console.error("Error handling journal entry:", err);
        return res
            .status(500)
            .json({ message: "Error handling journal entry." });
    }
});

router.get("/", async (req, res) => {
    const { id } = req.query;
    console.log(id);
    try {
        const journalQuery = `
        SELECT *
        FROM public.journals
        WHERE date = CURRENT_DATE AND user_id = $1;
    `;
        const result = await db.query(journalQuery, [id]);
        res.status(200).send(result.rows.length > 0 ? result.rows[0] : null);
    } catch (err) {
        console.error("Error fetching journal:", err);
        res.status(500).send("Error Occurred");
    }
});

export { router as journalRouter };
