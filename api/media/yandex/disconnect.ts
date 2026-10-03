import{clearCookie,env,json}from'../../_media-session.js';

export default{async fetch(request:Request){if(request.method!=='POST')return json({error:'method_not_allowed'},405,{Allow:'POST'});const envManaged=Boolean(env('YANDEX_DISK_OAUTH_TOKEN'));return json({connected:envManaged,provider:'yandex',envManaged,autonomousReady:envManaged},200,{'Set-Cookie':clearCookie('lifeos_yandex_token')})}};
