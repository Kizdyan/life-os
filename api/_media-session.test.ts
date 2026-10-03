import{describe,expect,it}from'vitest';import{clearCookie,cookie,json,randomUrlSafe,seal,setCookie,unseal}from'./_media-session.js';

describe('media server session helpers',()=>{
  it('seals and unseals server-only session payloads',async()=>{const secret='12345678901234567890123456789012',payload={accessToken:'secret-token',createdAt:123};const sealed=await seal(payload,secret);expect(sealed).not.toContain('secret-token');await expect(unseal(sealed,secret)).resolves.toEqual(payload)});
  it('uses secure HttpOnly SameSite cookies',()=>{const value=setCookie('lifeos_yandex_token','sealed',3600);expect(value).toContain('HttpOnly');expect(value).toContain('Secure');expect(value).toContain('SameSite=Lax');expect(clearCookie('lifeos_yandex_token')).toContain('Max-Age=0')});
  it('reads encoded cookies and creates URL-safe random values',()=>{const request=new Request('https://life.example.com',{headers:{cookie:'a=1; lifeos_yandex_token=hello%20world'}});expect(cookie(request,'lifeos_yandex_token')).toBe('hello world');expect(randomUrlSafe(48)).toMatch(/^[A-Za-z0-9_-]+$/)});
  it('preserves Headers instances when creating JSON responses',()=>{const headers=new Headers();headers.append('Set-Cookie','lifeos_session=sealed; HttpOnly; Secure');const response=json({ok:true},200,headers);expect(response.headers.get('set-cookie')).toContain('lifeos_session=sealed');expect(response.headers.get('cache-control')).toBe('no-store')});
});
