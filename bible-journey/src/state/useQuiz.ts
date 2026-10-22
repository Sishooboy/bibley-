import { useContext } from 'react';
import { QuizContext, type QuizApi } from './quizContext';

export function useQuiz(): QuizApi {
  const value = useContext(QuizContext);
  if (!value) throw new Error('useQuiz must be used inside QuizProvider');
  return value;
}
