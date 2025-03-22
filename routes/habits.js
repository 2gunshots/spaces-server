import express, { query } from "express";
import db from "./db.js";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const router = express.Router();

router.post("/create", (req, res) => {
    const { name, goal, metrics, repeat, days, type, showBadge, note, color } =
        req.body.habit;
    const { userId } = req.body;
    console.log(req.body);
    db.query(
        "INSERT INTO public.habits(habit_name, goal, metrics, repeat, days, type, show_badge, note, color, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);",
        [
            name,
            parseInt(goal),
            metrics,
            repeat,
            JSON.stringify(days),
            type,
            showBadge,
            note,
            color,
            userId,
        ],
        (err, result) => {
            if (err) {
                console.log(err);
                res.status(500).send("Error occurred while creating habit.");
            } else {
                // console.log(result);
                res.status(201).send("Habit created successfully.");
            }
        }
    );
});

router.post("/log", async (req, res) => {
    const { habitId, habitRepeat } = req.body;
    try {
        const query =
            "SELECT streak, last_log, goal, max_streak, total_entries, icsm from public.habits where habit_id = $1;";
        const habitResult = await db.query(query, [habitId]);

        const { streak, last_log, goal, max_streak, total_entries, icsm } =
            habitResult.rows[0];

        let totalCount = total_entries;
        let newStreak = streak;
        let maxStreak = max_streak;
        let isCurrentStreakMax = icsm;

        if (habitRepeat === "Daily") {
            const entriesQuery =
                "SELECT count(*) AS entries FROM public.habit_logs WHERE habit_id = $1 AND log_date = CURRENT_DATE;";
            const entriesResult = await db.query(entriesQuery, [habitId]);
            const totalEntries = parseInt(entriesResult.rows[0].entries, 10);
            console.log("entriesResult: ", entriesResult);
            console.log("totalEntries: ", totalEntries);

            const today = new Date();
            const lastLog = new Date(last_log);

            if (totalEntries + 1 === goal) {
                const differenceInDays = Math.floor(
                    (today - lastLog) / (1000 * 60 * 60 * 24) //probably returns in millisecods which is being converted to days
                );
                if (differenceInDays === 1) {
                    //last log was yeaterday
                    newStreak++;
                } else if (differenceInDays === 0) {
                    newStreak = newStreak + 1;
                } else {
                    //this accounts for all other conditions
                    // first log, broken streak,
                    newStreak = 1;
                }

                const streakQuery = `
                UPDATE public.habits SET streak = $1, last_log = CURRENT_DATE where habit_id = $2;
            `;
                db.query(streakQuery, [newStreak, habitId]);
            }
        } else if (habitRepeat === "Weekly") {
            const entriesQuery = `
            SELECT COUNT(*) AS entries
            FROM public.habit_logs
            WHERE habit_id = $1
                AND log_date >= date_trunc('week', CURRENT_DATE)
                AND log_date < date_trunc('week', CURRENT_DATE + INTERVAL '1 week');
            `;
            const entriesResult = await db.query(entriesQuery, [habitId]);

            // Get the total entries for this habit in the current week
            const totalEntries = parseInt(entriesResult.rows[0].entries, 10);

            const today = new Date();
            const lastLog = last_log ? new Date(last_log) : null;

            // Calculate difference in days from the last log date
            const getStartOfWeek = (date) => {
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
                const startOfWeek = new Date(date.setDate(diff));
                startOfWeek.setHours(0, 0, 0, 0); // Set to midnight
                return startOfWeek;
            };

            const currentWeekStart = getStartOfWeek(today);
            let lastLogWeekStart = null;
            if (lastLog) {
                lastLogWeekStart = getStartOfWeek(lastLog);
            } else {
                // If last_log is null, use current week start as default
                lastLogWeekStart = new Date(2003, 6, 11);
            }
            console.log(
                "lastLogWeekStart:",
                lastLogWeekStart,
                "currentWeekStart:",
                currentWeekStart
            );

            const differenceInMillis = currentWeekStart - lastLogWeekStart;
            const differenceInWeeks = Math.floor(
                differenceInMillis / (1000 * 60 * 60 * 24 * 7)
            );

            if (totalEntries + 1 == goal) {
                // If the total entries this week meet or exceed the goal
                if (differenceInWeeks === 1) {
                    // If the last log was a week ago, increase the streak
                    newStreak++;
                } else if (differenceInWeeks === 0) {
                    // If the habit was logged in this week, keep the streak the same
                    newStreak = newStreak + 1;
                } else {
                    // In all other cases, reset the streak (habit missed for the week)
                    newStreak = 1;
                }

                // Update the streak and the last log date to today's date
                const streakQuery = `
                UPDATE public.habits SET streak = $1, last_log = CURRENT_DATE where habit_id = $2;
            `;
                await db.query(streakQuery, [newStreak, habitId]);
            }
        }

        db.query(
            "INSERT INTO public.habit_logs(habit_id, entries) VALUES ($1, $2);",
            [habitId, 1]
        );
        if (maxStreak < newStreak) {
            maxStreak = newStreak;
            isCurrentStreakMax = true;
        }
        db.query(
            "UPDATE public.habits SET total_entries = $1, max_streak = $2, icsm = $3 WHERE habit_id = $4;",
            [totalCount + 1, maxStreak, isCurrentStreakMax, habitId]
        );
        res.status(201).json({
            message: "Entry logged and streak updated successfully.",
        });
    } catch (err) {
        console.error("Error logging entry:", err);
        res.status(500).json({ error: "Error occurred while logging entry." });
    }
});

router.delete("/dellog", async (req, res) => {
    let { habit } = req.body;
    console.log(req.body);
    try {
        const delQuery = `
            DELETE FROM public.habit_logs
            WHERE log_id = (
                SELECT log_id
                FROM habit_logs
                WHERE habit_id = $1
                ORDER BY log_date DESC
                LIMIT 1
            );
        `;
        await db.query(delQuery, [habit.habit_id]);

        if (habit.entries == habit.goal) {
            habit.streak = habit.streak - 1;
            if (habit.icsm === true && habit.max_streak > 0) {
                habit.max_streak--;
            }
        }
        habit.total_entries = habit.total_entries - 1;
        habit.entries = habit.entries - 1;

        const logResult = await db.query(
            "SELECT log_date FROM public.habit_logs WHERE habit_id = $1 ORDER BY log_date DESC LIMIT 1;",
            [habit.habit_id]
        );
        const lastLog = logResult.rows[0]?.log_date || null;

        await db.query(
            "UPDATE public.habits SET total_entries = $1, streak = $2, last_log = $3, max_streak = $4 WHERE habit_id = $5; ",
            [
                habit.total_entries,
                habit.streak,
                lastLog,
                habit.max_streak,
                habit.habit_id,
            ]
        );
        res.status(201).json({
            message: "Entry removed successfully.",
        });
    } catch (err) {
        console.error("Error deleting log entry:", err);
        res.status(500).json({
            error: "An error occurred while deleting the log entry.",
        });
    }
});

router.put("/update", async (req, res) => {
    const { habit } = req.body;
    console.log("Habit to Update: ", habit);
    try {
        const updateQuery = `
            UPDATE public.habits SET habit_name = $1, goal = $2, metrics = $3, repeat = $4, days = $5, type = $6, show_badge = $7, note = $8, color = $9
            WHERE habit_id = $10;
        `;
        db.query(updateQuery, [
            habit.name,
            habit.goal,
            habit.metrics,
            habit.repeat,
            JSON.stringify(habit.days),
            habit.type,
            habit.showBadge,
            habit.note,
            parseInt(habit.color),
            habit.id,
        ]);
        const res = await db.query(
            "SELECT * FROM public.habit_logs where habit_id = 11"
        );
        console.log("Structure: ", res);
    } catch (err) {
        console.error("Error updating habit:", err);
        res.status(500).json({ error: "Error occurred while updating habit." });
    }
});

router.post("/log/daily", async (req, res) => {
    //to habit_log and update streak in habits
    const { habitId } = req.body;
    // console.log(req.body);

    try {
        const query =
            "SELECT streak, last_log, goal from public.habits where habit_id = $1;";
        const habitResult = await db.query(query, [habitId]);

        // if (habitResult.rows.length === 0) {
        //     return res.status(404).json({ error: "habit not found" });
        // }

        const entriesQuery =
            "SELECT count(*) AS entries FROM public.habit_logs WHERE habit_id = $1 AND log_date = CURRENT_DATE;";
        const entriesResult = await db.query(entriesQuery, [habitId]);
        const totalEntries = parseInt(entriesResult.rows[0].entries, 10);
        console.log("entriesResult: ", entriesResult);
        console.log("totalEntries: ", totalEntries);

        const { streak, last_log, goal } = habitResult.rows[0];

        const today = new Date();
        const lastLog = new Date(last_log);

        if (totalEntries + 1 === goal) {
            const differenceInDays = Math.floor(
                (today - lastLog) / (1000 * 60 * 60 * 24) //probably returns in millisecods which is being converted to days
            );
            let newStreak = streak;
            if (differenceInDays === 1) {
                //last log was yeaterday
                newStreak++;
            } else if (differenceInDays === 0) {
                newStreak = newStreak;
            } else {
                //this accounts for all other conditions
                // first log, broken streak,
                newStreak = 1;
            }
            const streakQuery = `
                UPDATE public.habits SET streak = $1, last_log = CURRENT_DATE where habit_id = $2;
            `;
            db.query(streakQuery, [newStreak, habitId]);
        }

        db.query(
            "INSERT INTO public.habit_logs(habit_id, entries) VALUES ($1, $2);",
            [habitId, 1]
        );
        res.status(201).json({
            message: "Entry logged and streak updated successfully.",
        });
    } catch (err) {
        console.error("Error logging entry:", err);
        res.status(500).json({ error: "Error occurred while logging entry." });
    }
});

router.post("/log/weekly", async (req, res) => {
    const { habitId } = req.body; // The habit ID we are logging for
    try {
        // Fetch habit details (streak, last_log, goal)
        const query =
            "SELECT streak, last_log, goal FROM public.habits WHERE habit_id = $1;";
        const habitResult = await db.query(query, [habitId]);

        // Get the habit details
        const { streak, last_log, goal } = habitResult.rows[0];

        // Query to check if the habit has already been logged this week
        const entriesQuery = `
            SELECT COUNT(*) AS entries
            FROM public.habit_logs
            WHERE habit_id = $1
                AND log_date >= date_trunc('week', CURRENT_DATE)
                AND log_date < date_trunc('week', CURRENT_DATE + INTERVAL '1 week');
            `;
        const entriesResult = await db.query(entriesQuery, [habitId]);

        // Get the total entries for this habit in the current week
        const totalEntries = parseInt(entriesResult.rows[0].entries, 10);

        const today = new Date();
        const lastLog = last_log ? new Date(last_log) : null;

        // Calculate difference in days from the last log date
        const getStartOfWeek = (date) => {
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
            const startOfWeek = new Date(date.setDate(diff));
            startOfWeek.setHours(0, 0, 0, 0); // Set to midnight
            return startOfWeek;
        };

        const currentWeekStart = getStartOfWeek(today);
        const lastLogWeekStart = lastLog ? getStartOfWeek(lastLog) : null;

        const differenceInMillis = currentWeekStart - lastLogWeekStart;
        const differenceInWeeks = Math.floor(
            differenceInMillis / (1000 * 60 * 60 * 24 * 7)
        );

        let newStreak = streak;

        if (totalEntries + 1 >= goal) {
            // If the total entries this week meet or exceed the goal
            if (differenceInWeeks === 1) {
                // If the last log was a week ago, increase the streak
                newStreak++;
            } else if (differenceInWeeks === 0) {
                // If the habit was logged in this week, keep the streak the same
                newStreak = newStreak;
            } else {
                // In all other cases, reset the streak (habit missed for the week)
                newStreak = 1;
            }

            // Update the streak and the last log date to today's date
            const streakQuery = `
                UPDATE public.habits SET streak = $1, last_log = CURRENT_DATE WHERE habit_id = $2;
            `;
            await db.query(streakQuery, [newStreak, habitId]);
        }

        // Insert the log entry for the weekly habit
        await db.query(
            "INSERT INTO public.habit_logs(habit_id, entries, log_date) VALUES ($1, $2, CURRENT_DATE);",
            [habitId, 1]
        );

        res.status(201).json({
            message: "Weekly entry logged and streak updated successfully.",
        });
    } catch (err) {
        console.error("Error logging weekly entry:", err);
        res.status(500).json({ error: "Error occurred while logging entry." });
    }
});
router.delete("/", async (req, res) => {
    let { habitId } = req.query;
    habitId = parseInt(habitId);

    try {
        await db.query("DELETE FROM public.habit_logs WHERE habit_id = $1;", [
            habitId,
        ]);
        await db.query("DELETE FROM public.habits WHERE habit_id = $1;", [
            habitId,
        ]);
        res.status(200).json({
            message: "Habit deleted successfully",
        });
    } catch (err) {
        console.error("Error while deleting habit", err);
        res.status(500).json({ error: "Error occurred while deleting habit." });
    }
});

router.get("/", async (req, res) => {
    let { habitId } = req.query;
    habitId = parseInt(habitId);

    try {
        const repeatResult = await db.query(
            "SELECT repeat from public.habits WHERE habit_id = $1;",
            [habitId]
        );
        let query;
        if (repeatResult.rows[0].repeat === "Daily") {
            query = `
                SELECT h.*, COALESCE(t.entries, 0) AS entries
                FROM public.habits h
                LEFT JOIN (
                    SELECT habit_id, COUNT(*) AS entries
                    FROM public.habit_logs
                    WHERE log_date = CURRENT_DATE
                    GROUP BY habit_id
                ) t ON h.habit_id = t.habit_id
                WHERE h.habit_id = $1;
            `;
        } else {
            query = `
                SELECT h.*, COALESCE(t.entries, 0) AS entries
                FROM public.habits h
                LEFT JOIN (
                    SELECT habit_id, COUNT(*) AS entries
                    FROM public.habit_logs
                    WHERE log_date >= date_trunc('week', CURRENT_DATE)
                    /* + INTERVAL '1 day' */
                    AND log_date < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
                    GROUP BY habit_id
                ) t ON h.habit_id = t.habit_id
                WHERE h.habit_id = $1;
            `;
        }

        const data = await db.query(query, [habitId]);
        res.status(200).send(data.rows);
    } catch (err) {
        console.log("Error Occured: ", err);
    }
});

router.get("/all", async (req, res) => {
    const { id } = req.query;
    // console.log(req);
    // console.log("Fetch all habits: userid, ", id);
    try {
        const allidsDaily = await db.query(
            "SELECT habit_id FROM public.habits Where repeat = 'Daily' AND user_id = $1;",
            [id]
        );
        allidsDaily.rows.forEach(async (habit) => {
            await streakUpdate(habit.habit_id);
        });
        const allidsWeekly = await db.query(
            "SELECT habit_id FROM public.habits Where repeat = 'Weekly' AND user_id = $1;",
            [id]
        );
        allidsWeekly.rows.forEach(async (habit) => {
            await streakUpdateWeekly(habit.habit_id);
        });

        const dailyHabitsQuery = `
        SELECT h.*, COALESCE(t.entries, 0) AS entries FROM public.habits h
        LEFT JOIN (
            SELECT habit_id, COUNT(*) AS entries
            FROM public.habit_logs
            WHERE log_date = CURRENT_DATE
            GROUP BY habit_id
        ) t ON h.habit_id = t.habit_id
         WHERE h.repeat = 'Daily'
         AND user_id = $1
        ORDER BY h.created_at;`;

        const weeklyHabitsQuery = `
        SELECT h.*, COALESCE(t.entries, 0) AS entries
        FROM public.habits h
        LEFT JOIN (
            SELECT habit_id, COUNT(*) AS entries
            FROM public.habit_logs
            WHERE log_date >= date_trunc('week', CURRENT_DATE)
            /* + INTERVAL '1 day' */
                AND log_date < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
            GROUP BY habit_id
        ) t ON h.habit_id = t.habit_id
        WHERE h.repeat = 'Weekly'
        AND user_id = $1
        ORDER BY h.created_at;`;

        // db.query("select * from habits;", (err, result) => { //Too simple? wait for some joins
        const dailyResult = await db.query(dailyHabitsQuery, [id]);
        const weeklyResult = await db.query(weeklyHabitsQuery, [id]);
        res.status(200).json({
            dailyResult: dailyResult.rows,
            weeklyResult: weeklyResult.rows,
        });
    } catch (err) {
        console.error("Error fetching habits:", err);
        res.status(500).send("Error Occurred");
    }
});

const streakUpdate = async (habitId) => {
    try {
        const query =
            "SELECT streak, last_log FROM public.habits WHERE habit_id = $1;";
        const data = await db.query(query, [habitId]);
        // console.log(data);

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
                const icsm = false;
                const streakQuery =
                    "UPDATE habits SET streak = $1, icsm = $2 WHERE habit_id = $3;";
                db.query(streakQuery, [newStreak, icsm, habitId]);
            }
        }
    } catch (err) {
        console.error("Error in MidNight streak update:", err);
        res.status(500).json({
            error: "Error occurred while updating streak.",
        });
    }
};

const streakUpdateWeekly = async (habitId) => {
    try {
        // Fetch habit data
        const query =
            "SELECT streak, last_log FROM public.habits WHERE habit_id = $1;";
        const data = await db.query(query, [habitId]);
        const { streak, last_log } = data.rows[0];

        // Get today's date and the last log date
        const today = new Date();
        const lastLog = new Date(last_log);

        // Helper function to get the start of the week (Monday)
        const getStartOfWeek = (date) => {
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
            const startOfWeek = new Date(date.setDate(diff));
            startOfWeek.setHours(0, 0, 0, 0); // Set to midnight
            return startOfWeek;
        };

        // Get the start of the week (Monday) for today and last log
        const currentWeekStart = getStartOfWeek(new Date());
        const lastLogWeekStart = getStartOfWeek(lastLog);

        // Calculate the difference in weeks (checking the start of the week)
        const differenceInMillis = currentWeekStart - lastLogWeekStart;
        const differenceInWeeks = Math.floor(
            differenceInMillis / (1000 * 60 * 60 * 24 * 7)
        ); // Weeks difference

        let newStreak = streak;

        // Check if the habit streak should reset
        if (streak > 0) {
            if (differenceInWeeks > 1) {
                // If the difference is more than 1 week, reset the streak
                newStreak = 0;
                const icsm = false;

                // Update the streak in the database
                const streakQuery =
                    "UPDATE public.habits SET streak = $1, last_log = $2, icsm = $3 WHERE habit_id = $4;";
                await db.query(streakQuery, [newStreak, today, icsm, habitId]);
            }
            // else if (
            //     differenceInWeeks === 1 &&
            //     currentWeekStart.getTime() !== lastLogWeekStart.getTime()
            // ) {
            //     // If we're in a new week, reset the streak to 1
            //     newStreak = 1;

            //     // Update the streak in the database
            //     const streakQuery =
            //         "UPDATE habits SET streak = $1, last_log = $2 WHERE habit_id = $3;";
            //     await db.query(streakQuery, [newStreak, today, habitId]);
            // }
        }

        // If streak is already 0, no further action is needed
    } catch (err) {
        console.error("Error in weekly streak update:", err);
        res.status(500).json({
            error: "Error occurred while updating streak.",
        });
    }
};

const streakCalculate = async (habitId) => {
    try {
        // Step 1: Get the habit goal from the 'habits' table
        const habitQuery =
            "SELECT goal FROM public.habits WHERE habit_id = $1;";
        const habitData = await db.query(habitQuery, [habitId]);

        // If the habit doesn't exist or has no goal, return
        if (habitData.rows.length === 0) {
            console.error("Habit not found or no goal defined.");
            return;
        }

        const habitGoal = habitData.rows[0].goal;

        // Step 2: Get the distinct log dates for the habit, ordered by most recent
        const query =
            "SELECT DATE(log_date) AS log_date, COUNT(*) AS log_count FROM public.habit_logs WHERE habit_id = $1 GROUP BY DATE(log_date) ORDER BY log_date DESC;";
        const logData = await db.query(query, [habitId]);

        const logs = logData.rows.map((row) => ({
            logDate: new Date(row.log_date),
            logCount: row.log_count,
        }));

        // Step 3: If there are no logs, set streak to 0
        if (logs.length === 0) {
            await db.query(
                "UPDATE public.habits SET streak = 0 WHERE habit_id = $1;",
                [habitId]
            );
            return;
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1); // Get yesterday's date
        const yesterdayMidnight = new Date(yesterday.setHours(0, 0, 0, 0)); // Set time to midnight of yesterday

        // Step 4: Initialize the streak
        const today = new Date();
        const todayMidnight = new Date(today.setHours(0, 0, 0, 0)); // today's date at midnight
        let streak = 0;
        let todaysStreak = 0;

        // checking todays streak
        if (logs.length != 0) {
            const { logDate, logCount } = logs[0];
            const differenceInDays = Math.floor(
                (todayMidnight - logDate) / (1000 * 60 * 60 * 24)
            );
            if (differenceInDays === 0 && logCount >= habitGoal) {
                todaysStreak = 1;
            }
        }

        // Step 5: Loop through the logs to calculate the streak

        for (let i = 0; i < logs.length; i++) {
            const { logDate, logCount } = logs[i];
            const differenceInDays = Math.floor(
                (yesterdayMidnight - logDate) / (1000 * 60 * 60 * 24)
            );

            // Skip today's logs that are after yesterday midnight (logDate >= yesterdayMidnight)
            if (logDate >= yesterdayMidnight) {
                continue; // Skip this log and continue with the next one
            }

            // Only count the streak if the log count meets or exceeds the habit goal
            if (logCount >= habitGoal) {
                // If log is from yesterday or earlier consecutive days
                if (differenceInDays === streak) {
                    streak++; // Increment streak for each consecutive log that meets the goal
                } else if (differenceInDays > streak) {
                    // Once a gap is encountered, stop the streak (no need to check further days)
                    break;
                }
            } else {
                // If the goal is not met, break the loop as the streak is interrupted
                break;
            }
        }
        streak = streak + todaysStreak;

        // Step 6: Update the streak value in the database
        await db.query(
            "UPDATE public.habits SET streak = $1 WHERE habit_id = $2;",
            [streak, habitId]
        );
    } catch (err) {
        console.error("Error in streak update:", err);
        res.status(500).json({
            error: "Error occurred while updating streak.",
        });
    }
};

export { router as habitRouter };
