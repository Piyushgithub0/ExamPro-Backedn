const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const xml2js = require('xml2js');

/**
 * Parse CSV file for bulk question upload
 * Expected columns: questionText, option1, option2, option3, option4, correctOption (1-based), marks
 */
const parseCSV = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row, i) => {
    const options = [];
    let optIdx = 1;
    while (row[`option${optIdx}`] !== undefined) {
      options.push({ text: row[`option${optIdx}`], image: null });
      optIdx++;
    }

    const correctOption = parseInt(row.correctOption, 10) - 1; // convert to 0-based
    if (isNaN(correctOption) || correctOption < 0 || correctOption >= options.length) {
      throw new Error(`Row ${i + 2}: Invalid correctOption value`);
    }

    return {
      questionText: row.questionText,
      options,
      correctOption,
      marks: parseFloat(row.marks) || 1,
    };
  });
};

/**
 * Parse XML file for bulk question upload
 * Expected structure:
 * <questions>
 *   <question>
 *     <text>...</text>
 *     <options>
 *       <option correct="true">...</option>
 *       <option>...</option>
 *     </options>
 *     <marks>1</marks>
 *   </question>
 * </questions>
 */
const parseXML = async (filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parser = new xml2js.Parser({ explicitArray: true });
  const result = await parser.parseStringPromise(content);

  const questions = result.questions?.question || [];

  return questions.map((q, i) => {
    const text = q.text?.[0] || '';
    const marks = parseFloat(q.marks?.[0]) || 1;
    const rawOptions = q.options?.[0]?.option || [];

    let correctOption = -1;
    const options = rawOptions.map((opt, idx) => {
      const isCorrect = opt.$?.correct === 'true';
      if (isCorrect) correctOption = idx;
      return { text: typeof opt === 'string' ? opt : opt._ || opt, image: null };
    });

    if (correctOption === -1) {
      throw new Error(`Question ${i + 1}: No correct option marked`);
    }

    return { questionText: text, options, correctOption, marks };
  });
};

/**
 * Clean up temp uploaded file
 */
const cleanFile = (filePath) => {
  try { fs.unlinkSync(filePath); } catch (_) {}
};

module.exports = { parseCSV, parseXML, cleanFile };
