# Third-party notices

The web session protocol in `server/wechat-web-protocol.js` and the upload/save
request formats in `server/wechat-web.js` are adapted from
[xihe-lab/wechat-mp-mcp-server](https://github.com/xihe-lab/wechat-mp-mcp-server),
revision `6500b55572431ad5b30941ad92debde5d8e325b5`,
`src/webhub/api.ts` and `src/webhub/session.ts`, licensed under Apache License 2.0.
The original license is included at `licenses/wechat-mp-mcp-server-LICENSE`.

Changes: JavaScript integration into InkBridge, local session status, cover fields,
safe errors, image preflight, external link preservation, and tests. No third-party
hosted service is used. Other installed dependencies retain their own licenses.
