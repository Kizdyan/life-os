import type { PersonaPlatformVariant, PersonaPublicationJob } from './persona-state';
import type { PersonaPublisher, PersonaPublishVerification, PersonaPublishResult } from './persona-publication';

/** Instagram API adapter for the EXISTING Persona publication job protocol.
 * No browser token. No account-specific credentials in git or media state.
 * The caller must load user-approved assets from the canonical MediaStateStore.
 */
export interface InstagramPublisherConfig {
  accountId: string;
  accessToken: string;
  resolvePublicJpegUrls: (mediaAssetId: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  graphOrigin?: string;
  graphVersion?: string;
}
export class InstagramPublicationUncertain extends Error {
  constructor() { super('publication_outcome_unknown_manual_reconciliation_required'); }
}
function publicJpeg(url: string): boolean {
  try {
    const u=new URL(url);
    if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.hash)return false;
    if(u.hostname==='localhost'||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))return false;
    if(/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))return false;
    return /\.jpe?g$/i.test(u.pathname);
  } catch {return false;}
}
export class InstagramPhotoPublisher implements PersonaPublisher {
  readonly platform='instagram' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly base:string;
  constructor(private readonly config:InstagramPublisherConfig){
    if(!/^\d{5,25}$/.test(config.accountId))throw Error('A verified Instagram professional account ID is required');
    if(!config.accessToken.trim())throw Error('Instagram publisher requires a server-only access token');
    this.fetchImpl=config.fetchImpl??fetch;
    const origin=config.graphOrigin??'https://graph.facebook.com';
    const root=new URL(origin);
    if(root.protocol!=='https:'||!['graph.facebook.com','graph.instagram.com'].includes(root.hostname))
      throw Error('Unexpected Instagram Graph API origin');
    const version=config.graphVersion??'v25.0';
    if(!/^v\d{1,3}\.0$/.test(version))throw Error('Invalid Meta Graph API version');
    this.base=root.origin+'/'+version+'/';
  }
  async verify(job:PersonaPublicationJob,_variant:PersonaPlatformVariant):Promise<PersonaPublishVerification>{
    if(job.platform!=='instagram')throw Error('Wrong Persona publisher');
    if(!job.externalId)return {found:false,externalId:null,externalUrl:null};
    const data=await this.graphGet(job.externalId, 'id,permalink');
    if(String(data.id)!==job.externalId || typeof data.permalink!=='string')
      throw Error('Instagram media ownership or permalink not verified');
    return {found:true,externalId:String(data.id),externalUrl:data.permalink};
  }
  async publish(job:PersonaPublicationJob,variant:PersonaPlatformVariant):Promise<PersonaPublishResult>{
    if(job.state!=='approved'&&job.state!=='publishing')throw Error('Explicit approved Persona publication job required');
    if(job.platform!=='instagram'||variant.platform!=='instagram'||job.candidateId!==variant.candidateId)
      throw Error('Persona Instagram job/candidate mismatch');
    if(job.externalId)throw Error('Already published: verify instead of publishing again');
    const links=await this.config.resolvePublicJpegUrls(variant.mediaAssetId);
    if(!Array.isArray(links)||links.length<1||links.length>10||links.some(url=>!publicJpeg(url)))
      throw Error('Only 1-10 publicly accessible HTTPS JPEG media URLs can be published');
    if(!variant.caption?.trim())throw Error('Approved Instagram caption is required');
    let containerId:string;
    if(links.length===1){
      const result=await this.graphPost(this.config.accountId+'/media',{
        image_url:links[0],caption:variant.caption,
      });
      containerId=String(result.id||'');
    }else{
      const children:string[]=[];
      for(const image_url of links){
        const result=await this.graphPost(this.config.accountId+'/media',{image_url,is_carousel_item:'true'});
        if(!/^\d+$/.test(String(result.id||'')))throw Error('Instagram child container was not created');
        children.push(String(result.id));
      }
      const result=await this.graphPost(this.config.accountId+'/media',{
        media_type:'CAROUSEL',children:children.join(','),caption:variant.caption,
      });
      containerId=String(result.id||'');
    }
    if(!/^\d+$/.test(containerId))throw Error('Instagram container was not created');
    const ready=await this.graphGet(containerId,'status_code');
    if(ready.status_code!=='FINISHED')throw Error('instagram_media_container_not_ready');
    // Treat any lost/ambiguous publish response as UNKNOWN, not safely retryable.
    let mediaId:string;
    try {
      const result=await this.graphPost(this.config.accountId+'/media_publish',{creation_id:containerId});
      mediaId=String(result.id||'');
    }catch{throw new InstagramPublicationUncertain();}
    if(!/^\d+$/.test(mediaId))throw new InstagramPublicationUncertain();
    // Real external media ID, but 'verified' requires a separate media read.
    return {externalId:mediaId,externalUrl:null};
  }
  private async graphPost(path:string,payload:Record<string,string>):Promise<Record<string,unknown>>{
    const response=await this.fetchImpl(this.base+path,{
      method:'POST',
      headers:{Authorization:'Bearer '+this.config.accessToken,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams(payload),
    });
    if(!response.ok)throw Error('Instagram Graph API refused media request ('+response.status+')');
    return response.json() as Promise<Record<string,unknown>>;
  }
  private async graphGet(id:string,fields:string):Promise<Record<string,unknown>>{
    if(!/^\d+$/.test(id))throw Error('Invalid Instagram media/container ID');
    const url=new URL(this.base+id);url.searchParams.set('fields',fields);
    const response=await this.fetchImpl(url,{
      headers:{Authorization:'Bearer '+this.config.accessToken},
    });
    if(!response.ok)throw Error('Instagram Graph API verification failed ('+response.status+')');
    return response.json() as Promise<Record<string,unknown>>;
  }
}
