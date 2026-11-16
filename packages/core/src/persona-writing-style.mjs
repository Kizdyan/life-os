/** Conservative QA gate for unmistakable AI cliches in newly generated copy.
 *  The final voice still requires author review; never rewrite approved text.
 */
const banned=Object.freeze([
 ['это больше, чем','это больше, чем'],
 ['открой новую главу','открой новую главу'],
 ['раскрой свой потенциал','раскрой свой потенциал'],
 ['погрузись в удивительный мир','погрузись в удивительный мир'],
 ['погрузитесь в удивительный мир','погрузитесь в удивительный мир'],
 ['вдохновение повсюду','вдохновение повсюду'],
 ['контент, который цепляет','контент, который цепляет'],
]);
export function personaGeneratedCopyIssue(parts){
 if(!Array.isArray(parts))throw Error('Expected generated copy fragments');
 for(const value of parts){
  if(typeof value!=='string')continue;
  const text=value.toLocaleLowerCase('ru-RU').replace(/\s+/g,' ').trim();
  const match=banned.find(([token])=>text.includes(token));
  if(match)return {code:'AI_CLICHE',phrase:match[1]};
 }
 return null;
}
