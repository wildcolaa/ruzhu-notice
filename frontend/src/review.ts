import type {ReviewQuestion} from './types';
/** Local selections contain no answer key and never decide the ending. */
export class ReviewSelection {
 step=0;answers:Record<string,string>={};
 reset(){this.step=0;this.answers={};}
 choose(question:ReviewQuestion,option:string){if(question.options.some(o=>o.id===option))this.answers[question.id]=option;}
 complete(questions:ReviewQuestion[]){return questions.every(q=>q.options.some(o=>o.id===this.answers[q.id]));}
}
