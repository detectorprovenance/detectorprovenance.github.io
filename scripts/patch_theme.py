"""Patch the downloaded book-theme template: replace the dialog-based
search with a flat top-bar input.

The stock theme's search opens a modal dialog, and there is no template
option to change it, so we patch the compiled bundles in _build/templates
to inject a flat search input into the top bar. Run after
the template has been downloaded (any `myst build` or `myst start` does
that), and re-run whenever _build is cleared:

    python3 scripts/patch_theme.py

The deploy workflow runs this between a warm-up build and the real build.
"""

import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
THEME = os.path.normpath(
    os.path.join(HERE, "..", "_build", "templates", "site", "myst", "book-theme")
)

# Flat top-bar search runtime (replaces the theme's dialog search).
# Injected into the server-rendered HTML. The search index path is
# resolved relative to the current page so it also works when the site
# is served under a path prefix (GitHub Pages project sites).
_RUNTIME = """
;(function(){
  /* ---------- flat top-bar search (replaces the theme's dialog) -------- */
  var idx=null,loading=false,waiters=[],base='';
  /* Record URLs in the index are written from the site root ('/modules/...')
     with no path prefix, so on a GitHub Pages project site they have to be
     prefixed or every hit lands on the 404 page. The prefix that serves the
     index is the prefix the pages live under, so probe for it and keep it. */
  function basePrefixes(){
    var seg=window.location.pathname.split('/').filter(Boolean);
    return seg.length?['/'+seg[0],'']:[''];
  }
  function href(u){
    return (u&&u.charAt(0)==='/')?base+u:u;
  }
  function load(cb){
    if(cb&&idx)return cb();
    if(cb)waiters.push(cb);
    if(idx||loading)return;
    loading=true;
    var pre=basePrefixes();
    function attempt(i){
      if(i>=pre.length){loading=false;waiters=[];return;}
      fetch(pre[i]+'/myst.search.json').then(function(r){
        if(!r.ok)throw new Error('http '+r.status);
        return r.json();
      }).then(function(d){
        idx=d.records||[];base=pre[i];loading=false;
        prepare(idx);
        var w=waiters;waiters=[];w.forEach(function(f){f();});
      }).catch(function(){attempt(i+1);});
    }
    attempt(0);
  }
  /* Pages in different sections often share a title, so prefix every hit
     with its ancestor pages, read off the URL path (folders: true nests each
     page URL under its parent's). */
  function prepare(recs){
    var titles={};
    recs.forEach(function(r){
      if(r.type==='lvl1')titles[r.url]=r.hierarchy.lvl1;
    });
    recs.forEach(function(r){
      var h=r.hierarchy||{},up=[];
      var seg=r.url.split('#')[0].split('/').filter(Boolean);
      for(var i=1;i<seg.length;i++){
        var t=titles['/'+seg.slice(0,i).join('/')];
        if(t)up.push(t);
      }
      var own=[h.lvl1,h.lvl2,h.lvl3].filter(Boolean);
      r.crumb=up.concat(own).join(' \\u203a ');
      r.ownHay=own.join(' ').toLowerCase();
      r.upHay=up.join(' ').toLowerCase();
      r.hay=(r.crumb+' '+(r.content||'')).toLowerCase();
    });
  }
  function search(q){
    if(!idx)return [];
    var terms=q.toLowerCase().split(/\\s+/).filter(Boolean);
    if(!terms.length)return [];
    var seen={},out=[];
    idx.forEach(function(rec){
      var score=0;
      for(var i=0;i<terms.length;i++){
        if(rec.hay.indexOf(terms[i])<0)return;
        if(rec.ownHay.indexOf(terms[i])>=0)score+=3;
        else if(rec.upHay.indexOf(terms[i])>=0)score+=2;
        score+=1;
      }
      if(rec.type!=='content')score+=2;
      var key=rec.url.split('#')[0];   // one hit per page, its best section
      if(seen[key]!==undefined){
        if(out[seen[key]].score>=score)return;
        out[seen[key]]={score:score,url:rec.url,crumb:rec.crumb,
                        content:rec.content||''};
        return;
      }
      seen[key]=out.length;
      out.push({score:score,url:rec.url,crumb:rec.crumb,
                content:rec.content||''});
    });
    out.sort(function(a,b){return b.score-a.score;});
    return out.slice(0,8);
  }
  function build(bar){
    if(!bar||bar.dataset.dpSearch)return;
    bar.dataset.dpSearch='1';
    var wrap=document.createElement('div');
    wrap.className='dp-search';
    var input=document.createElement('input');
    input.type='search';
    input.placeholder='Search';
    input.setAttribute('aria-label','Search this site');
    var list=document.createElement('div');
    list.className='dp-search-results';
    list.hidden=true;
    wrap.appendChild(input);
    wrap.appendChild(list);
    bar.style.display='none';
    bar.after(wrap);
    var active=-1,hits=[];
    function render(){
      list.innerHTML='';
      if(!hits.length){list.hidden=true;return;}
      hits.forEach(function(h,i){
        var a=document.createElement('a');
        a.href=href(h.url);
        a.className='dp-search-hit'+(i===active?' active':'');
        var t=document.createElement('div');
        t.className='dp-search-hit-title';
        t.textContent=h.crumb;
        a.appendChild(t);
        if(h.content){
          var c=document.createElement('div');
          c.className='dp-search-hit-text';
          c.textContent=h.content.slice(0,110);
          a.appendChild(c);
        }
        list.appendChild(a);
      });
      list.hidden=false;
    }
    function run(){
      active=-1;
      hits=search(input.value.trim());
      render();
    }
    input.addEventListener('focus',function(){load();});
    input.addEventListener('input',function(){
      load(run);   // re-runs once the index finishes loading
      run();
    });
    input.addEventListener('keydown',function(ev){
      if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
        ev.preventDefault();
        if(!hits.length)return;
        active=(active+(ev.key==='ArrowDown'?1:-1)+hits.length)%hits.length;
        render();
      }else if(ev.key==='Enter'){
        var h=hits[active<0?0:active];
        if(h){ev.preventDefault();window.location.href=href(h.url);}
      }else if(ev.key==='Escape'){
        input.value='';hits=[];render();input.blur();
      }
    });
    document.addEventListener('click',function(ev){
      if(!wrap.contains(ev.target)){hits=[];render();}
    });
    document.addEventListener('keydown',function(ev){
      if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='k'){
        ev.preventDefault();ev.stopPropagation();input.focus();input.select();
      }
    },true);
  }
  /* ---------- autoplay movies ----------
     The theme writes autoplay/loop but not muted, so browsers block
     playback; mute them (they have no audio track anyway) and play. */
  function vidTick(){
    document.querySelectorAll('video[autoplay]').forEach(function(v){
      if(!v.muted)v.muted=true;
      if(v.paused)v.play().catch(function(){});
    });
  }

  function tick(){
    build(document.querySelector('button.myst-search-bar'));
    vidTick();
  }
  function start(){
    tick();
    // React hydration replaces these nodes, so keep re-checking for a while
    var n=0,iv=setInterval(function(){tick();if(++n>40)clearInterval(iv);},250);
    new MutationObserver(function(){tick();}).observe(
      document.documentElement,{subtree:true,childList:true});
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start);
  }else{start();}
})();
"""

# The marker embeds a hash of the runtime, so editing the code above is
# enough to make the next patch run replace an older injected copy.
INLINER_MARK = (
    "/*dp-runtime-" + hashlib.sha1(_RUNTIME.encode()).hexdigest()[:8] + "*/"
)
INLINER = INLINER_MARK + _RUNTIME


def main():
    if not os.path.isdir(THEME):
        sys.exit("book-theme template not found; run `myst build` first")
    total = 0
    # dev server: drop the 1-year immutable cache so patched bundles reload
    server_js = os.path.join(THEME, "server.js")
    if os.path.exists(server_js):
        with open(server_js) as f:
            ssrc = f.read()
        fixed = ssrc.replace(
            "{ immutable: true, maxAge: '1y' }", "{ maxAge: '5m' }"
        )
        if fixed != ssrc:
            with open(server_js, "w") as f:
                f.write(fixed)
            print("patched server.js (cache headers)")
    # inject the search runtime into the server-rendered HTML itself; the
    # document is never long-cached, unlike the fingerprinted JS bundles
    import json
    server_bundle = os.path.join(THEME, "build", "index.js")
    with open(server_bundle) as f:
        bsrc = f.read()
    tag = json.dumps("<script>" + INLINER + "</script></body>")
    if INLINER_MARK in bsrc:
        print("already patched: build/index.js (search runtime)")
    elif "dp-runtime" in bsrc:  # older runtime: swap it out
        new_bsrc, n = re.subn(
            r'"<script>[^"]*dp-runtime[^"]*</script></body>"',
            lambda m: tag,
            bsrc,
        )
        with open(server_bundle, "w") as f:
            f.write(new_bsrc)
        total += n
        print(f"updated build/index.js runtime ({n} site)")
    else:
        new_bsrc, n = re.subn(
            r'new Response\("<!DOCTYPE html>"\+(\w+),',
            lambda m: (
                'new Response("<!DOCTYPE html>"+'
                f'{m.group(1)}.replace("</body>",{tag}),'
            ),
            bsrc,
        )
        if n == 0:
            sys.exit("SSR injection point not found; theme version changed?")
        with open(server_bundle, "w") as f:
            f.write(new_bsrc)
        total += n
        print(f"patched build/index.js (search runtime, {n} site)")
    # Rename the patched entry + manifest so browsers that cached the stock
    # bundles (1-year immutable) fetch the patched versions. The new name is
    # the stock name plus a suffix: the stock names carry the theme's content
    # hash, so each theme release gets its own patched name too, and a
    # browser never pairs a cached entry from an older theme with new chunks.
    import glob, shutil
    pub = os.path.join(THEME, "public", "build")
    rename = []
    for stem in ("entry.client-", "manifest-"):
        hits = [os.path.basename(f)[:-3]
                for f in sorted(glob.glob(os.path.join(pub, stem + "*.js")))
                if not f.endswith("-dp.js")]
        if len(hits) == 1:
            rename.append((hits[0], hits[0] + "-dp"))
    if len(rename) != 2:
        print("skipped cache-bust rename: stock bundle names not found")
    elif os.path.exists(os.path.join(pub, rename[0][1] + ".js")):
        print("already renamed: entry.client + manifest")
    else:
        for old, new in rename:
            shutil.copyfile(
                os.path.join(pub, f"{old}.js"), os.path.join(pub, f"{new}.js")
            )
        for path in [os.path.join(THEME, "build", "index.js"),
                     os.path.join(pub, rename[1][1] + ".js")]:
            with open(path) as f:
                s = f.read()
            for old, new in rename:
                s = s.replace(old, new)
            with open(path, "w") as f:
                f.write(s)
        print("renamed entry.client + manifest (cache bust)")

    print(f"done ({total} replacements)")


if __name__ == "__main__":
    main()
