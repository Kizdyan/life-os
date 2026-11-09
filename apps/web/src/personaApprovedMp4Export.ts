/**
 * A real file may be downloaded only when its bytes were locally imported,
 * matched the verified final MP4 SHA-256 and received human final-cut approval.
 *
 * A persisted approval alone is insufficient: after a refresh the browser no
 * longer has the video file, so the author must select it again.
 * Never interprets final-cut approval as permission to publish.
 */
export function approvedPersonaMp4DownloadName(
 finished:{finishedSha256:string;authorReview?:{decision:string}|null}|null|undefined,
 selectedFileSha256:string|null,
 hasLocalVideo:boolean,
):string|null{
 if(!finished||!hasLocalVideo||finished.authorReview?.decision!=='approved-final-cut')return null;
 const expected=finished.finishedSha256;
 if(!/^[a-f0-9]{64}$/i.test(expected)||!selectedFileSha256||
  !/^[a-f0-9]{64}$/i.test(selectedFileSha256)||
  expected.toLowerCase()!==selectedFileSha256.toLowerCase())return null;
 return 'persona-reel-approved-'+expected.slice(0,12).toLowerCase()+'.mp4';
}
