var S={soal:[],jw:{},i:0,id:{},mulai:0,cfg:{}},KEY='asas_v1',$=function(x){return document.getElementById(x)};
function cap(v){return v.replace(/\s{2,}/g,' ').toLowerCase().replace(/(^|\s)\S/g,function(c){return c.toUpperCase()})}
function math(el){if(window.renderMathInElement)renderMathInElement(el,{delimiters:[{left:'$',right:'$',display:false}],throwOnError:false})}
function show(v){['v1','v2','v2b','v3'].forEach(function(x){$(x).classList.add('hide')});v.split(',').forEach(function(x){$(x).classList.remove('hide')})}
function save(){localStorage.setItem(KEY,JSON.stringify({id:S.id,jw:S.jw,i:S.i,mulai:S.mulai}))}
function cek(){$('go').disabled=!($('nm').value.trim()&&$('ab').value&&$('kl').value)}
function init(){
 for(var i=1;i<=36;i++)$('ab').add(new Option(i,i));
 'ABCDEFG'.split('').forEach(function(c){$('kl').add(new Option('VIII '+c,'VIII '+c))});
 $('nm').oninput=function(){this.value=cap(this.value);cek()};$('nm').onblur=function(){this.value=cap(this.value.trim());cek()};
 $('ab').onchange=$('kl').onchange=cek;
 fetch('soal.json').then(function(r){return r.json()}).then(function(d){S.soal=d.soal;
  return fetch(API_URL+'?aksi=config').then(function(r){return r.json()}).then(function(c){S.cfg=c},function(){S.cfg={buka:true,menit:0}})}).then(function(){
  if(!S.cfg.buka){$('inf').textContent='⏸ Latihan belum dibuka oleh guru.';$('go').disabled=true;$('go').onclick=null;return}
  $('inf').textContent=S.soal.length+' soal'+(S.cfg.menit?' • waktu '+S.cfg.menit+' menit':'');
  var t=localStorage.getItem(KEY);if(t){t=JSON.parse(t);S.id=t.id;S.jw=t.jw;S.i=t.i;S.mulai=t.mulai;mulaiSoal()}});
 $('go').onclick=function(){S.id={nama:cap($('nm').value.trim()),absen:$('ab').value,kelas:$('kl').value};S.mulai=Date.now();S.i=0;save();mulaiSoal()};
 $('pv').onclick=function(){go(S.i-1)};$('nx').onclick=function(){go(S.i+1)};$('kr').onclick=function(){kirim(false)};
}
function mulaiSoal(){show('v2,v2b');nav();tampil();
 if(S.cfg.menit){var tick=function(){var s=Math.max(0,Math.round((S.mulai+S.cfg.menit*60000-Date.now())/1000));$('tm').textContent='⏱ '+Math.floor(s/60)+':'+('0'+s%60).slice(-2);if(s<=0){clearInterval(S.tt);kirim(true)}};tick();S.tt=setInterval(tick,1000)}}
function go(n){if(n<0||n>=S.soal.length)return;S.i=n;save();nav();tampil();window.scrollTo(0,0)}
function nav(){var h='';S.soal.forEach(function(s,k){h+='<button class="'+(S.jw[s.no]?'d ':'')+(k==S.i?'a':'')+'" onclick="go('+k+')">'+s.no+'</button>'});$('nav').innerHTML=h}
function set(no,v){S.jw[no]=v;save();nav();tampil()}
function tampil(){var s=S.soal[S.i],h='<b>Soal '+s.no+' dari '+S.soal.length+'</b>',j=S.jw[s.no]||'';
 if(s.pre)h+='<p>'+s.pre+'</p>';if(s.bacaan)h+='<div class="bc">'+s.bacaan+'</div>';
 h+='<p>'+s.teks+'</p>';if(s.gambar)h+='<img src="'+s.gambar+'" alt="gambar soal">';if(s.teks2)h+='<p>'+s.teks2+'</p>';
 if(s.tipe=='pg')s.opsi.forEach(function(o,k){var L='ABCD'[k];h+='<button class="o '+(j==L?'on':'')+'" onclick="set('+s.no+',\''+L+'\')"><b>'+L+'.</b><span>'+o+'</span></button>'});
 if(s.tipe=='pgk'){h+='<i>Pilih semua jawaban yang benar (boleh lebih dari satu).</i>';var a=j?j.split(','):[];s.opsi.forEach(function(o,k){var L=''+(k+1),on=a.indexOf(L)>=0;h+='<button class="o '+(on?'on':'')+'" onclick="tgl('+s.no+',\''+L+'\')"><b>'+(on?'☑':'☐')+'</b><span>'+o+'</span></button>'})}
 if(s.tipe=='bs'){h+='<p>Tentukan <b>Benar</b> atau <b>Salah</b> dari pernyataan berikut.</p><div class="bc">'+s.pernyataan+'</div><div class="bar"><button class="o '+(j=='B'?'on':'')+'" onclick="set('+s.no+',\'B\')">Benar</button><button class="o '+(j=='S'?'on':'')+'" onclick="set('+s.no+',\'S\')">Salah</button></div>'}
 if(s.tipe=='isi')h+='<input id="in" placeholder="Tulis jawabanmu" value="'+j.replace(/"/g,'&quot;')+'" autocomplete="off">';
 if(s.tipe=='ura')h+='<textarea id="in" rows="5" placeholder="Tulis langkah dan jawaban akhirmu. Pada baris terakhir tulis: Jawaban: ...">'+j+'</textarea>';
 $('q').innerHTML=h;var e=$('in');if(e)e.oninput=function(){S.jw[s.no]=e.value.trim();save();nav()};
 $('pv').disabled=S.i==0;$('nx').disabled=S.i==S.soal.length-1;math($('q'))}
function tgl(no,L){var a=(S.jw[no]?S.jw[no].split(','):[]),k=a.indexOf(L);k>=0?a.splice(k,1):a.push(L);a.sort();set(no,a.join(','))}
function kirim(paksa){
 var kosong=S.soal.filter(function(s){return !S.jw[s.no]}).length;
 if(!paksa&&!confirm(kosong?kosong+' soal belum dijawab. Yakin kirim sekarang?':'Yakin ingin mengirim jawaban? Jawaban tidak bisa diubah lagi.'))return;
 $('er').classList.add('hide');$('kr').disabled=true;$('kr').textContent='Mengirim…';
 fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({aksi:'kirim',nama:S.id.nama,absen:S.id.absen,kelas:S.id.kelas,jawab:S.jw})})
 .then(function(r){return r.json()}).then(function(d){$('kr').disabled=false;$('kr').textContent='Kirim Jawaban';
  if(d.error){$('er').innerHTML='⚠️ '+d.error+' Jawabanmu masih tersimpan. <button onclick="kirim(true)">Coba Lagi</button>';$('er').classList.remove('hide');return}
  clearInterval(S.tt);localStorage.removeItem(KEY);hasil(d)})
 .catch(function(){$('kr').disabled=false;$('kr').textContent='Kirim Jawaban';$('er').innerHTML='⚠️ Gagal terkirim (sinyal bermasalah?). Jawabanmu <b>tidak hilang</b>. <button onclick="kirim(true)">Coba Lagi</button>';$('er').classList.remove('hide')})}
function hasil(d){show('v3');var h='<h1>Terima kasih, '+S.id.nama+'! 🎉</h1><p>Nilaimu:</p><div class="big">'+d.nilai+'</div><p style="text-align:center">Skor '+d.skor+' dari '+d.maks+'. Terus semangat belajar, kamu pasti bisa lebih hebat lagi!</p>';
 if(d.kunci){h+='<h2>Kunci Jawaban</h2><div class="sc"><table><tr><th>No</th><th>Kunci</th></tr>';d.kunci.forEach(function(k,i){h+='<tr><td>'+(i+1)+'</td><td>'+k+'</td></tr>'});h+='</table></div>'}
 $('v3').innerHTML=h;math($('v3'))}
init();
