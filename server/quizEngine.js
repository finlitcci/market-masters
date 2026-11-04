// Quiz system: question selection, answer shuffling, grading, and class statistics.
// The correct answer lives only on the server. Browsers receive shuffled option text and learn the
// right answer only after they submit.
import { QUIZ, QUESTIONS_PER_WEEK } from './data/quiz.js';
import { seededShuffle } from './rng.js';

/** The 3 questions this room asks in a given week (chosen from the 5-question bank, in a seeded order). */
export function weekQuestions(seed, week) {
  const bank = QUIZ[week]?.questions || [];
  return seededShuffle(bank, `${seed}:quiz:${week}`).slice(0, QUESTIONS_PER_WEEK);
}

/** perm[displayPosition] = original option index. Stable for a player, so a refresh never reshuffles. */
export function optionOrder(seed, playerId, week, qid) {
  return seededShuffle([0, 1, 2, 3], `${seed}:opt:${playerId}:${week}:${qid}`);
}

export function grade(question, perm, pos) {
  const chosen = perm[pos];
  return { chosen, correct: chosen === question.correct, correctPos: perm.indexOf(question.correct) };
}

/** Class-wide results for one week from raw answer rows [{qid, choice}] */
export function classStats(seed, week, answerRows, playerCount) {
  return weekQuestions(seed, week).map((q) => {
    const rows = answerRows.filter((a) => a.qid === q.id);
    const counts = [0, 0, 0, 0];
    rows.forEach((r) => counts[r.choice]++);
    let top = null;
    counts.forEach((n, i) => { if (i !== q.correct && n > 0 && (!top || n > top.count)) top = { text: q.options[i], count: n }; });
    return {
      id: q.id, question: q.q, options: q.options.map((text, i) => ({ text, count: counts[i], correct: i === q.correct })),
      answered: rows.length, playerCount, correctCount: counts[q.correct],
      correctPct: rows.length ? Math.round((counts[q.correct] / rows.length) * 100) : null,
      commonMistake: top, explanation: q.explain,
    };
  });
}
