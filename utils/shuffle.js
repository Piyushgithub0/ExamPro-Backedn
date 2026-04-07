/**
 * Fisher-Yates shuffle: returns a new shuffled array
 */
const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Shuffle questions and remap correct option indices for shuffled options
 */
const shuffleExamQuestions = (questions, shuffleQ = true, shuffleO = true) => {
  let qs = shuffleQ ? shuffle(questions) : [...questions];

  return qs.map((q) => {
    const qObj = q.toObject ? q.toObject() : { ...q };

    if (shuffleO && qObj.options && qObj.options.length > 1) {
      // Create mapping: originalIndex → option
      const indexed = qObj.options.map((opt, i) => ({ opt, originalIndex: i }));
      const shuffledIndexed = shuffle(indexed);

      // Find new position of correct option
      const newCorrectIndex = shuffledIndexed.findIndex(
        (item) => item.originalIndex === qObj.correctOption
      );

      qObj.options = shuffledIndexed.map((item) => item.opt);
      qObj.correctOption = newCorrectIndex;
    }

    return qObj;
  });
};

module.exports = { shuffle, shuffleExamQuestions };
