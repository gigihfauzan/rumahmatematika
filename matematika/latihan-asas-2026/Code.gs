// ===== Latihan Pra-ASAS: backend Google Apps Script =====
// Kunci jawaban HANYA ada di sini (tidak dikirim ke browser siswa).
var NB = 28;
var K = [
 {t:'pg',k:'A',b:1},{t:'pg',k:'D',b:1},{t:'pg',k:'C',b:1},{t:'pg',k:'B',b:1},{t:'pg',k:'D',b:1},
 {t:'pg',k:'A',b:1},{t:'pg',k:'B',b:1},{t:'pg',k:'C',b:1},{t:'pg',k:'A',b:1},{t:'pg',k:'B',b:1},
 {t:'pgk',k:'2,3',b:2},{t:'pgk',k:'1,4',b:2},{t:'pgk',k:'2,4',b:2},{t:'pgk',k:'1,4',b:2},{t:'pgk',k:'2,4',b:2},
 {t:'bs',k:'S',b:2},{t:'bs',k:'B',b:2},{t:'bs',k:'B',b:2},{t:'bs',k:'B',b:2},{t:'bs',k:'S',b:2},
 {t:'isi',k:['2bc^7/a^5'],b:2},{t:'isi',k:['6√7'],b:2},{t:'isi',k:['2.534x10^-5','2.534e-5'],b:2},{t:'isi',k:['41'],b:2},{t:'isi',k:['9'],b:2},
 {t:'ura',k:['2√15+3√6','3√6+2√15'],b:5},{t:'ura',k:['11'],b:5},{t:'ura',k:['4000','4.000','4000.00','4.000.00'],b:5}
];
var MAKS = K.reduce(function(a,x){return a+x.b},0); // 55

function P_(){return PropertiesService.getScriptProperties();}
function ss_(){return SpreadsheetApp.getActiveSpreadsheet();}
function out_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function N_(s){return String(s==null?'':s).toLowerCase().replace(/akar/g,'√').replace(/[×*]/g,'x').replace(/\s|cm|rp|m|[(){}]/g,'').replace(/(\d),(\d)/g,'$1.$2');}
function cfg_(){var p=P_();return {buka:p.getProperty('BUKA')==='1',menit:Number(p.getProperty('MENIT')||0),satu:p.getProperty('SATU')!=='0',pemb:p.getProperty('PEMB')==='1'};}

function doGet(e){ return out_(e.parameter.aksi==='config' ? {buka:cfg_().buka,menit:cfg_().menit} : {ok:true}); }
function doPost(e){
  try{
    var d=JSON.parse(e.postData.contents);
    if(d.aksi==='kirim') return out_(kirim_(d));
    if(d.aksi==='admin') return out_(admin_(d));
    return out_({error:'Permintaan tidak dikenal.'});
  }catch(err){ return out_({error:'Terjadi kesalahan: '+err}); }
}

function nilaiButir_(k,j){ // -> 1 benar / 0 salah
  j=(j==null?'':String(j)).trim(); if(!j) return 0;
  if(k.t==='isi'||k.t==='ura'){
    var teks=k.t==='ura' ? j.split(/jawaban\s*:/i).pop() : j; // uraian: dibaca setelah "Jawaban:"
    var n=N_(teks); return k.k.some(function(a){return N_(a)===n || (k.t==='ura' && n.slice(-N_(a).length)===N_(a) && N_(a).length>0 && n.length<=N_(a).length+3);})?1:0;
  }
  return j===k.k?1:0;
}
function tampilKunci_(){return K.map(function(k){
  if(k.t==='pgk') return k.k.split(',').map(function(x){return 'ABCD'[x-1]}).join(', ');
  if(k.t==='bs') return k.k==='B'?'Benar':'Salah';
  return Array.isArray(k.k)?k.k[0]:k.k;});}

function kirim_(d){
  var c=cfg_(); if(!c.buka) return {error:'Latihan sedang ditutup.'};
  var nama=String(d.nama||'').trim().replace(/\s+/g,' '); if(!nama||!d.absen||!d.kelas) return {error:'Identitas belum lengkap.'};
  var lock=LockService.getScriptLock(); lock.waitLock(30000);
  try{
    var sh=sheetHasil_(), id=(nama+'|'+d.absen+'|'+d.kelas).toLowerCase();
    if(c.satu && sh.getLastRow()>1){
      var ex=sh.getRange(2,2,sh.getLastRow()-1,3).getValues();
      for(var i=0;i<ex.length;i++) if((ex[i][0]+'|'+ex[i][1]+'|'+ex[i][2]).toLowerCase()===id) return {error:'Kamu sudah pernah mengirim jawaban.'};
    }
    var J=[],B=[],skor=0;
    for(var i=0;i<NB;i++){var j=(d.jawab||{})[i+1]||'', b=nilaiButir_(K[i],j); J.push(j); B.push(b); skor+=b*K[i].b;}
    var nilai=Math.round(skor/MAKS*10000)/100;
    sh.appendRow([new Date(),nama,Number(d.absen),d.kelas].concat(J,B,[skor,nilai]));
    var r={skor:skor,maks:MAKS,nilai:nilai}; if(c.pemb) r.kunci=tampilKunci_();
    return r;
  } finally { lock.releaseLock(); }
}

function sheetHasil_(){
  var sh=ss_().getSheetByName('Hasil Siswa');
  if(!sh){ sh=ss_().insertSheet('Hasil Siswa');
    var h=['Waktu Kirim','Nama','Absen','Kelas'],i;
    for(i=1;i<=NB;i++)h.push('Jwb '+i); for(i=1;i<=NB;i++)h.push('Benar '+i); h.push('Skor','Nilai (0-100)');
    sh.appendRow(h); sh.setFrozenRows(1); sh.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#cfe2f3');}
  return sh;
}
function baca_(){
  var sh=sheetHasil_(); if(sh.getLastRow()<2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,4+2*NB+2).getValues().map(function(r){
    return {waktu:r[0],nama:r[1],absen:r[2],kelas:r[3],j:r.slice(4,4+NB),b:r.slice(4+NB,4+2*NB).map(Number),skor:Number(r[4+2*NB]),nilai:Number(r[5+2*NB])};});
}

// ===== Analisis butir (rumus transparan, lihat catatan di sheet) =====
function mean_(a){return a.length?a.reduce(function(x,y){return x+y},0)/a.length:0;}
function sd_(a){var m=mean_(a);return Math.sqrt(mean_(a.map(function(x){return (x-m)*(x-m)})));}
function kPs_(p){return p>0.70?'Mudah':(p>=0.30?'Sedang':'Sukar');}
function kDy_(d){return d>=0.40?'Baik sekali':(d>=0.30?'Baik':(d>=0.20?'Cukup':(d>=0?'Jelek':'Sangat jelek (negatif)')));}
function hitung(R){
  var n=R.length, T=R.map(function(r){return r.skor}), mt=mean_(T), st=sd_(T);
  var urut=R.slice().sort(function(a,b){return b.skor-a.skor}), g=Math.max(1,Math.round(0.27*n));
  var atas=urut.slice(0,g), bawah=urut.slice(n-g), butir=[], sumpq=0;
  for(var i=0;i<NB;i++){
    var bn=R.reduce(function(a,r){return a+r.b[i]},0), p=n?bn/n:0, q=1-p; sumpq+=p*q;
    var D=(atas.reduce(function(a,r){return a+r.b[i]},0)-bawah.reduce(function(a,r){return a+r.b[i]},0))/g;
    var rp=0; if(n>1&&st>0&&p>0&&p<1){var mp=mean_(R.filter(function(r){return r.b[i]===1}).map(function(r){return r.skor}));rp=(mp-mt)/st*Math.sqrt(p/q);}
    var peng='-', mati=[];
    if(K[i].t==='pg'||K[i].t==='pgk'){
      var cnt=[0,0,0,0]; R.forEach(function(r){var v=String(r.j[i]||''); if(!v)return;
        (K[i].t==='pg'?[ 'ABCD'.indexOf(v)+1 ]:v.split(',').map(Number)).forEach(function(x){if(x>=1&&x<=4)cnt[x-1]++;});});
      var kunciOps=K[i].t==='pg'?['ABCD'.indexOf(K[i].k)+1]:K[i].k.split(',').map(Number);
      peng=cnt.map(function(c,x){var tag=kunciOps.indexOf(x+1)>=0?'*':''; if(!tag&&n&&c<0.05*n){mati.push('ABCD'[x]);} return 'ABCD'[x]+tag+':'+c;}).join('  ');
      if(mati.length) peng+='  | TIDAK BERFUNGSI: '+mati.join(',');
    }
    var rek=(D<=0.10)?'Buang':((D<0.30||p<0.30||p>0.90||mati.length)?'Revisi':'Dipakai');
    butir.push({no:i+1,tipe:K[i].t,benar:bn,p:p,kp:kPs_(p),d:D,kd:kDy_(D),rp:rp,peng:peng,rek:rek});
  }
  var tot=R.map(function(r){return r.b.reduce(function(a,x){return a+x},0)}), vt=Math.pow(sd_(tot),2);
  var kr=(n>1&&vt>0)?(NB/(NB-1))*(1-sumpq/vt):0, N=R.map(function(r){return r.nilai});
  var bins=[['0-20',0,20],['21-40',20.0001,40],['41-60',40.0001,60],['61-80',60.0001,80],['81-100',80.0001,100]].map(function(b){return [b[0],N.filter(function(x){return x>=b[1]&&x<=b[2]}).length]});
  var kel={}; R.forEach(function(r){(kel[r.kelas]=kel[r.kelas]||[]).push(r.nilai)});
  return {butir:butir,n:n,rata:mean_(N),sd:sd_(N),maks:N.length?Math.max.apply(null,N):0,min:N.length?Math.min.apply(null,N):0,kr20:kr,bins:bins,kelas:Object.keys(kel).sort().map(function(k){return [k,kel[k].length,mean_(kel[k])]})};
}
function tulis_(nama,baris){var s=ss_().getSheetByName(nama)||ss_().insertSheet(nama);s.clear();
  s.getRange(1,1,baris.length,Math.max.apply(null,baris.map(function(r){return r.length}))).setValues(baris.map(function(r){var m=Math.max.apply(null,baris.map(function(x){return x.length}));while(r.length<m)r.push('');return r}));
  s.getRange(1,1,1,s.getLastColumn()).setFontWeight('bold').setBackground('#cfe2f3');s.setFrozenRows(1);return s;}
function tulisAnalisis(){
  var R=baca_(), a=hitung(R), r2=function(x){return Math.round(x*1000)/1000};
  var B=[['No','Tipe','Jumlah Benar','P (Kesukaran)','Kategori P','D (Daya Pembeda)','Kategori D','r point-biserial','Pemilih Opsi (* = kunci)','Rekomendasi']];
  a.butir.forEach(function(b){B.push([b.no,b.tipe,b.benar,r2(b.p),b.kp,r2(b.d),b.kd,r2(b.rp),b.peng,b.rek])});
  B.push([],['CATATAN RUMUS'],['P = jumlah benar / jumlah peserta. Acuan: >0,70 Mudah; 0,30-0,70 Sedang; <0,30 Sukar'],
   ['D = (benar kelompok atas 27% - benar kelompok bawah 27%) / jumlah siswa per kelompok. Acuan: >=0,40 Baik sekali; 0,30-0,39 Baik; 0,20-0,29 Cukup; <0,20 Jelek; negatif = sangat jelek'],
   ['r pbis = (Mp - Mt) / SD x akar(p/q); Mp = rata-rata skor yang benar, Mt = rata-rata semua, SD = simpangan baku skor total. Acuan: >=0,30 baik; <0,20 lemah'],
   ['Pengecoh tidak berfungsi: opsi salah yang dipilih kurang dari 5% peserta. Untuk soal PG kompleks (11-15) opsi 1-4 ditulis A-D.'],
   ['Rekomendasi: Buang jika D<=0,10; Revisi jika D<0,30, P<0,30, P>0,90, atau ada pengecoh tidak berfungsi; selain itu Dipakai. Butir isian/uraian dinilai benar/salah (0/1) untuk analisis.']);
  tulis_('Analisis Butir',B);
  var S=[['Statistik','Nilai'],['Jumlah peserta',a.n],['Rata-rata nilai',r2(a.rata)],['Simpangan baku',r2(a.sd)],['Nilai tertinggi',a.maks],['Nilai terendah',a.min],['Reliabilitas KR-20',r2(a.kr20)],[],['Distribusi nilai','Jumlah siswa']].concat(a.bins,[[],['Rumus KR-20: (k/(k-1)) x (1 - jumlah(p x q) / varians skor benar total), k = 28 butir'],['Acuan reliabilitas: >=0,70 baik; 0,40-0,69 cukup; <0,40 rendah']]);
  tulis_('Statistik Tes',S);
  tulis_('Rekap per Kelas',[['Kelas','Jumlah Peserta','Rata-rata Nilai']].concat(a.kelas.map(function(k){return [k[0],k[1],r2(k[2])]})));
}

// ===== Admin =====
function admin_(d){
  var pw=P_().getProperty('ADMIN_PW'); if(!pw||d.pw!==pw) return {error:'Kata sandi salah.'};
  var p=P_();
  if(d.op==='simpan'){p.setProperty('BUKA',d.buka?'1':'0');p.setProperty('MENIT',String(Number(d.menit)||0));p.setProperty('SATU',d.satu?'1':'0');p.setProperty('PEMB',d.pemb?'1':'0');}
  if(d.op==='xlsx'){
    tulisAnalisis(); SpreadsheetApp.flush();
    var url='https://docs.google.com/spreadsheets/d/'+ss_().getId()+'/export?format=xlsx';
    var res=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}});
    return {xlsx:Utilities.base64Encode(res.getBlob().getBytes())};
  }
  var R=baca_(), N=R.map(function(r){return r.nilai});
  return {cfg:cfg_(),n:R.length,rata:mean_(N),maks:N.length?Math.max.apply(null,N):0,min:N.length?Math.min.apply(null,N):0,
    rows:R.map(function(r){return {nama:r.nama,absen:r.absen,kelas:r.kelas,skor:r.skor,nilai:r.nilai,waktu:Utilities.formatDate(new Date(r.waktu),'Asia/Jakarta','dd/MM HH:mm')}})};
}
