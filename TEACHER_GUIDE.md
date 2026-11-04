# Teacher guide

**Time:** about 3 to 5 minutes per week (8 weeks, roughly 30 to 40 minutes) plus any discussion you add. The quiz adds about 3 minutes a week; you can switch it off when you create the game.
**You need:** a computer on a projector, students with phones, and the game running (see the README).
**Teacher-only extras:** [Event schedule](EVENT_SCHEDULE.md) (what each story is designed to do) and [Quiz bank](QUIZ_BANK.md) (answer key). Do not project those.

## Before class
1. Start the server (`npm start`) or open your deployed address, then go to `/host` on your computer.
2. Choose settings: **weekly quiz** (on by default) and **discussion period** (a timer and prompts while trading is locked). Click **Create game**.
3. Project the screen. Students scan the QR code or type the PIN at the address shown. Names appear as they join.
4. **Manage players** (bottom bar) lets you remove any player, for example an inappropriate name. **Lock joining** stops new players.
5. Optional: tick **Skip the student introduction** if the class already knows stocks, ETFs, and diversification. Otherwise students read a 5-screen introduction while you talk it through.

## What students see
Each student has a six-step progress bar and a green "next step" card, four sections (My Portfolio, Companies, News, Leaderboard), and a **How it works** button that replays the introduction. Their button to tell you they are done is **Finish trading for this week**. It is not a purchase, and they can undo it until you lock trading.

## Running each week
You press one big button per step. Nothing advances on a timer. If your screen refreshes, the game is restored.

| Step | Students see | You do |
|---|---|---|
| **Briefing** (privately) | Company info and prices; no news yet | Click **Show preview** to read the week's four stories on your screen. It is hidden by default so projecting is safe. Click **Publish news and open trading**. |
| **Trading open** | News, company pages with charts, trade panel | Class reads and decides. The screen shows who has submitted and the published stories. Prompt: "What is good news in this story, and what is a worry?" Click **Lock trading**. |
| **Locked** (discussion) | "Trading is locked" | With discussion on, a timer and three prompts help you ask students to explain the news before the answer. Click **Reveal market reaction**. |
| **Market reveal** | Each company's move, and what drove it | The table shows every price move and its main drivers. Below, see what each story did. Compare with students' predictions. Click **Start the quiz** (or **Show the leaderboard** if the quiz is off). |
| **Quiz** | 3 questions, one at a time, with explanations | The projector shows **only how many students have finished** and who is still answering. Questions and answers stay hidden. Click **End quiz** when you are ready: answering closes, and you see each question, the correct answer, how the class answered, and the most common mistake, for a two-minute debrief. Then click **Show the leaderboard**. |
| **Leaderboard** | Rank, top 10, and a personal **reflection** | Top five animate into place. Ranking is by portfolio value only. Open **Class quiz results** if you want them. Click **Start Week N+1**. |
| **After Week 8** | A final report | Podium, awards, rankings, the best and weakest investments, class quiz results, and every student's own report with lessons learned. |

Other controls: **Lock/Unlock joining** (any time), **End game** (jumps to final results), **Play again with these players** (same room and names, new $1,000 each, a different market), **Host a new game** (new PIN).

## Things worth saying out loud
- Stories are fictional. Several have good and bad parts on purpose: strong sales with falling margins, results that beat or miss what investors expected.
- The same news affects companies differently (interest-rate week: debt-heavy firms fall more, the bank is cushioned).
- The ETF averages the ten companies: it rarely wins a week, and rarely loses badly.
- A random element means a sound decision can have a bad week. The winner may simply have been lucky; the final screen says so, and the Awards reward diversification and steady results, with the rules printed under each award.

## If something goes wrong
- **Student cannot join:** check the PIN, that joining is not locked, and that the phone is on the same Wi-Fi (local mode).
- **Student refreshed or lost signal:** nothing is lost; reopen the page. If they cleared their browser data they cannot reclaim that player: unlock joining and let them join under a new name, then remove the old one.
- **Your screen froze:** refresh. Your host session is saved in that browser. Do not use a different browser or a private window.
- **Double-clicked a button:** harmless; the second click is ignored.
