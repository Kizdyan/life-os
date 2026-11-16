export type ActorPortfolioShot={
 id:string;order:number;startSec:number;durationSec:number;line:string;action:string;
 kind:string;camera:string;performance:string;framing:string;
 lighting:{version:1;style:string;scene:string;preset:string;title:string;key:string;fill:string;back:string;background:string;note:string;evidence:string;source:string};
 mediaStatus:'not_recorded';editorialApproved:false;
};
export type ActorPortfolioProject={
 version:1;kind:'actor_portfolio';id:string;title:string;genre:'drama'|'comedy'|'musical';
 conflict:string;purpose:string;durationSec:number;firstFrameHook:string;visualIdentity:string;
 scriptStatus:'template_draft_pending_author_review';publicationApproved:false;
 script:Array<{id:string;line:string;action:string;durationSec:number}>;
 storyboard:ActorPortfolioShot[];
 editPlan:{version:1;kind:string;status:'intent_only';palette:string;rule:string;publicationApproved:false;beats:Array<{order:number;shotId:string;purpose:string;editIntent:string;mediaStatus:string;approvedAssetId?:string;authorReviewRequired:true}>};
 createdAt:string;updatedAt:string;
};
export declare function generateActorPortfolio(input:{id:string;title:string;genre:'drama'|'comedy'|'musical';now?:string}):ActorPortfolioProject;
export declare function isActorPortfolio(value:unknown):value is ActorPortfolioProject;
export declare function arsenalKnowledge():{version:number;rules:Array<{id:string;area:string;name:string;referenceId:number|null;verified:string;trigger:string;effect:string}>;policies:Record<string,unknown>};
export declare function visualIdentityConfig():{version:number;id:string;label:string;colors:{ink:string;paper:string;sand:string;warm:string;muted:string;warning:string;accentShadow:string};fonts:{primary:string;secondary:string;subtitles:string};layout:Record<string,unknown>;grading:Record<string,unknown>;ffmpeg:{workingColor:string;subtitleFontFamily:string;subtitlePrimaryHex:string;subtitleOutlineHex:string;subtitleFontSize1080p:number;subtitleOutlinePx1080p:number}};
export declare function arsenalRule(id:string):{id:string;name:string;area:string;effect:string}|null;
export declare function buildAssociativeEditPlan(shots:Array<{id:string;kind:string;action:string}>,availableAssets?:Array<{shotId:string;assetId:string;isVerified:boolean;rightsConfirmed:boolean;authorReviewed:boolean;approvedForEdit:boolean}>):ActorPortfolioProject['editPlan'];
