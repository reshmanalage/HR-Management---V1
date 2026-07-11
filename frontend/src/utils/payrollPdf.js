/**
 * payrollPdf.js  -  Dreamspan HRMS PDF Generator  (Premium Light Edition)
 * ASCII-safe only (jsPDF Helvetica — no Unicode special chars)
 */
import jsPDF     from "jspdf";
import autoTable from "jspdf-autotable";

// ── PALETTE (light / premium) ────────────────────────────────────────────────
const NAVY      = [30,  58, 138];   // reserved for doc header only
const NAVY_MID  = [59,  92, 175];   // section titles, accents
const BLUE_BG   = [239, 246, 255];  // #EFF6FF  light blue bg
const GREY_BG   = [248, 250, 252];  // #F8FAFC  light grey bg
const GREEN_BG  = [240, 253, 244];  // #F0FDF4  light green bg
const RED_BG    = [254, 242, 242];  // #FEF2F2  light red bg
const AMBER_BG  = [255, 251, 235];  // #FFFBEB  light amber bg
const PURP_BG   = [245, 243, 255];  // light purple bg
const BORD      = [226, 232, 240];  // #E2E8F0  border grey
const BORD_DARK = [203, 213, 225];  // slightly darker border
const GREEN_C   = [22,  163,  74];  // #16A34A
const RED_C     = [220,  38,  38];  // #DC2626
const AMBER_C   = [217, 119,   6];  // amber text
const PURP_C    = [124,  58, 237];  // purple text
const BLUE_C    = [37,   99, 235];  // blue text
const TPRI      = [15,  23,  42];   // near-black body
const TSEC      = [51,  65,  85];   // secondary text
const TLBL      = [100, 116, 139];  // label / muted
const TMUT      = [148, 163, 184];  // very muted
const WHITE     = [255, 255, 255];

// Portrait A4
const PW = 210, PH = 297, ML = 12, MR = 12, CW = 186;
// Landscape A4
const LPW = 297, LPH = 210, LML = 10, LMR = 10, LCW = 277;

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const MON3   = ["Jan","Feb","Mar","Apr","May","Jun",
                "Jul","Aug","Sep","Oct","Nov","Dec"];

// ── FORMATTERS ────────────────────────────────────────────────────────────────
const n0 = (v) => Number(v ?? 0);
const f2 = (v) => n0(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const f0 = (v) => n0(v).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0});

function slug(run)  { return MON3[(run.period_month??1)-1]+(run.period_year??""); }
function mfull(run) { return MONTHS[(run.period_month??1)-1]+" "+(run.period_year??""); }
function cycle(run) {
  const m=run.period_month, y=run.period_year;
  const pm=m===1?12:m-1, py=m===1?y-1:y;
  return "21 "+MON3[pm-1]+" "+py+" - 20 "+MON3[m-1]+" "+y;
}
function cycleTotalDays(run) {
  const m=run.period_month, y=run.period_year;
  const pm=m===1?12:m-1, py=m===1?y-1:y;
  return (new Date(py,pm,0).getDate()-20)+20;
}
function today() {
  return new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
}
function otFmt(h) {
  const v=n0(h); if(!v) return "00:00";
  return String(Math.floor(v)).padStart(2,"0")+":"+
         String(Math.round((v%1)*60)).padStart(2,"0");
}

// Amount in words (Indian system, ASCII only)
const _O=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
  "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const _T=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function _nw(n){
  if(!n)   return "";
  if(n<20) return _O[n];
  if(n<100) return _T[Math.floor(n/10)]+(n%10?" "+_O[n%10]:"");
  if(n<1000) return _O[Math.floor(n/100)]+" Hundred"+(n%100?" "+_nw(n%100):"");
  if(n<1e5)  return _nw(Math.floor(n/1000))+" Thousand"+(n%1000?" "+_nw(n%1000):"");
  if(n<1e7)  return _nw(Math.floor(n/1e5))+" Lakh"+(n%1e5?" "+_nw(n%1e5):"");
  return _nw(Math.floor(n/1e7))+" Crore"+(n%1e7?" "+_nw(n%1e7):"");
}
function inWords(amt) {
  const r=Math.floor(Math.abs(n0(amt))), p=Math.round((Math.abs(n0(amt))-r)*100);
  let w=_nw(r)?_nw(r)+" Rupees":"";
  if(p>0) w+=(w?" and ":"")+_nw(p)+" Paise";
  return (w||"Zero")+" Only";
}

// ── LOGO ──────────────────────────────────────────────────────────────────────
async function loadLogo(url) {
  if(!url) return null;
  try {
    const res=await fetch(url); if(!res.ok) return null;
    const blob=await res.blob();
    return await new Promise((ok,err)=>{
      const r=new FileReader();
      r.onload=()=>ok(r.result); r.onerror=err; r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── DRAW HELPERS ──────────────────────────────────────────────────────────────
function fill(doc,x,y,w,h,fc,r=0) {
  doc.setFillColor(...fc);
  r>0?doc.roundedRect(x,y,w,h,r,r,"F"):doc.rect(x,y,w,h,"F");
}
function fillStroke(doc,x,y,w,h,fc,sc,lw=0.3,r=0) {
  doc.setFillColor(...fc); doc.setDrawColor(...sc); doc.setLineWidth(lw);
  r>0?doc.roundedRect(x,y,w,h,r,r,"FD"):doc.rect(x,y,w,h,"FD");
}
function hline(doc,x1,x2,y,c=BORD,lw=0.3) {
  doc.setDrawColor(...c); doc.setLineWidth(lw); doc.line(x1,y,x2,y);
}
function sf(doc,sz,st="normal",c=TPRI) {
  doc.setFontSize(sz); doc.setFont("helvetica",st); doc.setTextColor(...c);
}
function tx(doc,s,x,y,o={}) { doc.text(String(s??""),x,y,o); }

// ── DOCUMENT HEADER ───────────────────────────────────────────────────────────
// Light white header; navy title strip; thin accent line below
function drawHeader(doc, logoData, company, title, period, pw=PW, ml=ML, mr=MR) {
  const H = 36;
  fill(doc,0,0,pw,H,WHITE);

  if(logoData) {
    try      { doc.addImage(logoData,"PNG",  ml, 5, 28,22,undefined,"FAST"); }
    catch(_) { try{ doc.addImage(logoData,"JPEG",ml,5,28,22,undefined,"FAST"); }catch(_2){} }
  }

  const cx = pw/2;
  sf(doc,14,"bold",NAVY);
  tx(doc,company.name||"COMPANY",cx,12,{align:"center"});

  if(company.address) { sf(doc,6.5,"normal",TLBL); tx(doc,company.address, cx,18,{align:"center"}); }
  if(company.address2){ sf(doc,6.5,"normal",TLBL); tx(doc,company.address2,cx,23,{align:"center"}); }

  // Navy title strip
  fill(doc,0,H-8,pw,8,NAVY);
  sf(doc,8.5,"bold",WHITE);
  tx(doc,title,cx,H-2.5,{align:"center"});
  if(period){
    sf(doc,7.5,"normal",[180,210,255]);
    tx(doc,period,pw-mr-2,H-2.5,{align:"right"});
  }

  // Thin blue accent below strip
  fill(doc,0,H,pw,0.8,[147,197,253]);

  return H+1;
}

// ── FOOTER ────────────────────────────────────────────────────────────────────
function drawFooter(doc,company,pn,pt,pw=PW,ml=ML,mr=MR,ph=PH) {
  const fy=ph-12;
  hline(doc,ml,pw-mr,fy,BORD,0.3);
  sf(doc,5.8,"normal",TMUT);
  tx(doc,"This is a computer generated document. No signature required.",ml,fy+4);
  if(company.regdAddress){
    sf(doc,5.5,"normal",TMUT);
    tx(doc,"Regd. Office: "+company.regdAddress,ml,fy+8);
  }
  sf(doc,5.8,"normal",TMUT);
  tx(doc,"Generated: "+today()+"   |   CONFIDENTIAL",pw/2,fy+4,{align:"center"});
  tx(doc,"Page "+pn+" / "+pt,pw-mr,fy+4,{align:"right"});
}

// ── SECTION TITLE (light style) ───────────────────────────────────────────────
// Instead of dark-filled bar: left-bordered label on white/light-grey bg
function sectionTitle(doc,y,label,sub="",pw=PW,ml=ML,cw=CW) {
  // Light grey row with navy left accent bar
  fill(doc,ml,y,cw,8,GREY_BG);
  fill(doc,ml,y,2.5,8,NAVY_MID);             // left accent bar
  sf(doc,8.5,"bold",NAVY_MID);
  tx(doc,label,ml+6,y+5.5);
  if(sub){ sf(doc,7,"normal",TLBL); tx(doc,sub,ml+cw-2,y+5.5,{align:"right"}); }
  hline(doc,ml,ml+cw,y+8,BORD,0.25);
  return y+8+3;
}

// ── LIGHT CARDS (white bg, colored top border) ────────────────────────────────
function drawLightCards(doc,y,cards,ml=ML,cw=CW) {
  const n=cards.length, gap=3, crdW=(cw-(n-1)*gap)/n, H=21;
  cards.forEach(({label,value,sub,accent},i)=>{
    const cx=ml+i*(crdW+gap);
    const ac=accent||NAVY_MID;
    fillStroke(doc,cx,y,crdW,H,WHITE,BORD,0.25,1.5);
    // top color bar
    fill(doc,cx,y,crdW,2.5,ac,0);
    sf(doc,5.8,"normal",TLBL);
    tx(doc,label,cx+crdW/2,y+8,{align:"center"});
    sf(doc,10.5,"bold",ac);
    tx(doc,String(value),cx+crdW/2,y+15.5,{align:"center"});
    if(sub){ sf(doc,5.5,"normal",TMUT); tx(doc,sub,cx+crdW/2,y+19.5,{align:"center"}); }
  });
  return y+H+4;
}

// ── EMPLOYEE INFO GRID ────────────────────────────────────────────────────────
// 6 columns: label | value | label | value | label | value
function infoGrid(doc,y,rows,ml=ML,mr=MR,cw=CW) {
  // Column widths tuned so labels never wrap (fixed narrow label cols)
  const W=[28,42,30,42,28,36]; // sum=206 — but autotable respects margin
  autoTable(doc,{
    startY:y, margin:{left:ml,right:mr},
    body:rows,
    styles:{
      fontSize:8,
      cellPadding:{top:3,bottom:3,left:4,right:4},
      lineColor:BORD, lineWidth:0.2,
      valign:"middle", overflow:"linebreak",
    },
    columnStyles:{
      0:{cellWidth:W[0], fillColor:GREY_BG, textColor:TLBL, fontStyle:"bold", fontSize:7, overflow:"visible"},
      1:{cellWidth:W[1], fillColor:WHITE,   textColor:TPRI, fontSize:8},
      2:{cellWidth:W[2], fillColor:GREY_BG, textColor:TLBL, fontStyle:"bold", fontSize:7, overflow:"visible"},
      3:{cellWidth:W[3], fillColor:WHITE,   textColor:TPRI, fontSize:8},
      4:{cellWidth:W[4], fillColor:GREY_BG, textColor:TLBL, fontStyle:"bold", fontSize:7, overflow:"visible"},
      5:{cellWidth:W[5], fillColor:WHITE,   textColor:TPRI, fontSize:8},
    },
    tableLineColor:BORD, tableLineWidth:0.2,
  });
  return doc.lastAutoTable.finalY+4;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SALARY SLIP  (Portrait A4)
// ═══════════════════════════════════════════════════════════════════════════════
export async function downloadSalarySlip(entry,run,emp=null,company={},attData=null) {
  const doc      = new jsPDF({unit:"mm",format:"a4",compress:true});
  const logoData = await loadLogo(company.logoUrl);

  // 1. HEADER
  let y=drawHeader(doc,logoData,company,
    "ESTIMATED PAY SLIP",
    "For the Month of "+mfull(run));
  y+=3;

  // 2. EMPLOYEE DETAILS
  y=sectionTitle(doc,y,"EMPLOYEE DETAILS");

  const empNm  = entry.employee_name??("Employee #"+entry.employee_id);
  const empCd  = entry.employee_code?"#"+entry.employee_code:"#"+entry.employee_id;
  const desig  = emp?.designation?.title??"-";
  const dept   = emp?.department?.name??"-";
  const grade  = emp?.grade??"-";
  const gender = emp?.gender??"-";
  const pan    = emp?.statutory?.pan_number??"-";
  const uan    = emp?.statutory?.uan_number??"-";
  const pfNo   = emp?.statutory?.pf_member_id??"-";
  const esicNo = emp?.statutory?.esic_number??"-";
  const payMod = emp?.payment_mode
    ? emp.payment_mode.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())
    : "Bank Transfer";
  const pBank  = emp?.bank_accounts?.find(b=>b.is_primary)??emp?.bank_accounts?.[0]??null;
  const bankDtl= pBank
    ? (pBank.bank_name||"")+(pBank.account_number?" XXXX"+String(pBank.account_number).slice(-4):"")
    : "-";

  y=infoGrid(doc,y,[
    ["EMP NAME",  empNm,  "DESIGNATION", desig,   "DEPARTMENT",   dept   ],
    ["EMP CODE",  empCd,  "GRADE/LEVEL", grade,   "GENDER",       gender ],
    ["PAN NO.",   pan,    "UAN NO.",     uan,     "PAYMENT MODE", payMod ],
    ["PF NO.",    pfNo,   "ESIC NO.",    esicNo,  "BANK DETAILS", bankDtl],
  ]);

  // 3. SUMMARY CARDS
  y=sectionTitle(doc,y,"PAY PERIOD SUMMARY","Cycle: "+cycle(run));

  const lopDays=n0(entry.lop_days), otH=n0(entry.ot_hours);
  const worked =attData?.total_present??"-";

  y=drawLightCards(doc,y,[
    {label:"MONTHLY GROSS",   value:"Rs."+f0(entry.gross),          accent:BLUE_C  },
    {label:"PER DAY SALARY",  value:"Rs."+f2(entry.per_day_salary), accent:BLUE_C,
     sub:"Gross / "+cycleTotalDays(run)+" days"},
    {label:"WORKED DAYS",     value:String(worked),                  accent:GREEN_C,
     sub:"of "+cycleTotalDays(run)+" days"},
    {label:"LOP DAYS",        value:lopDays>0?lopDays.toFixed(2):"0.00",
     accent:lopDays>0?RED_C:TLBL,
     sub:lopDays>0?"Ded: Rs."+f0(entry.lop_amount):"No deduction"},
    {label:"OT HOURS",        value:otFmt(otH),                     accent:n0(otH)>0?GREEN_C:TLBL},
    {label:"NET SALARY",      value:"Rs."+f0(entry.net_pay),        accent:GREEN_C },
  ]);

  // 4. EARNINGS & DEDUCTIONS (equal-width, light headers)
  y=sectionTitle(doc,y,"EARNINGS & DEDUCTIONS");

  const earnBody=[
    ["BASIC",           f0(entry.basic),   f0(entry.actual_basic)  ],
    ["HRA",             f0(entry.hra),     f0(entry.actual_hra)    ],
    ["OTHER ALLOWANCE", f0(entry.others),  f0(entry.actual_others) ],
    ["OT AMOUNT",       "",                n0(entry.ot_amount)>0?f0(entry.ot_amount):"0"      ],
    ["REIMBURSEMENT",   "",                n0(entry.reimbursement)>0?f0(entry.reimbursement):"0"],
    ...(n0(entry.incentive)>0?[["INCENTIVE","",f0(entry.incentive)]]:[]),
    ...(n0(entry.bonus)>0    ?[["BONUS",    "",f0(entry.bonus)    ]]:[]),
  ];
  const dedBody=[
    ["EMPLOYEE PF",   f0(entry.actual_pf)],
    ["EMPLOYEE ESIC", f0(entry.ee_esic)  ],
    ["PROF. TAX",     f0(entry.pt)       ],
    ["ADVANCE",       n0(entry.advance)>0?f0(entry.advance):"0"],
    ...(n0(entry.contract_deduction)>0?[["CONTRACT DED.",f0(entry.contract_deduction)]]:[]),
    ...(n0(entry.other_deduction)>0   ?[["OTHER DED.",   f0(entry.other_deduction)   ]]:[]),
    ...(n0(entry.extra_deduction_1)>0 ?[["EXTRA DED. 1", f0(entry.extra_deduction_1) ]]:[] ),
    ...(n0(entry.extra_deduction_2)>0 ?[["EXTRA DED. 2", f0(entry.extra_deduction_2) ]]:[] ),
  ];

  const maxR=Math.max(earnBody.length,dedBody.length);
  while(earnBody.length<maxR) earnBody.push(["","",""]);
  while(dedBody.length <maxR) dedBody.push(["",""]);

  const tblY=y, halfW=(CW-3)/2;

  // LEFT: Earnings  — light blue-grey header
  autoTable(doc,{
    startY:tblY, margin:{left:ML, right:PW-ML-halfW},
    head:[["DESCRIPTION","RATE (Rs.)","AMOUNT (Rs.)"]],
    body:earnBody,
    foot:[["GROSS EARNINGS",f0(entry.gross),f0(entry.total_earnings)]],
    styles:{
      fontSize:8.5, cellPadding:{top:3.2,bottom:3.2,left:4,right:4},
      lineColor:BORD, lineWidth:0.2, textColor:TPRI,
    },
    headStyles:{fillColor:BLUE_BG, textColor:NAVY_MID, fontStyle:"bold", fontSize:7.5, halign:"center"},
    footStyles:{fillColor:GREEN_BG, textColor:GREEN_C,  fontStyle:"bold", fontSize:8.5},
    columnStyles:{
      0:{cellWidth:47, fontStyle:"bold", textColor:TSEC},
      1:{cellWidth:22, halign:"right", textColor:TLBL},
      2:{cellWidth:22, halign:"right", fontStyle:"bold", textColor:TPRI},
    },
    alternateRowStyles:{fillColor:GREY_BG},
    tableLineColor:BORD, tableLineWidth:0.2,
    didParseCell(d){
      if(d.section==="body"&&!d.row.raw[0]&&!d.row.raw[1]&&!d.row.raw[2])
        { d.cell.styles.fillColor=WHITE; d.cell.styles.lineWidth=0; }
    },
  });
  const lY=doc.lastAutoTable.finalY;

  // RIGHT: Deductions  — light red-grey header
  autoTable(doc,{
    startY:tblY, margin:{left:ML+halfW+3, right:MR},
    head:[["DESCRIPTION","AMOUNT (Rs.)"]],
    body:dedBody,
    foot:[["TOTAL DEDUCTIONS",f0(entry.total_deductions)]],
    styles:{
      fontSize:8.5, cellPadding:{top:3.2,bottom:3.2,left:4,right:4},
      lineColor:BORD, lineWidth:0.2, textColor:TPRI,
    },
    headStyles:{fillColor:RED_BG, textColor:RED_C,   fontStyle:"bold", fontSize:7.5, halign:"center"},
    footStyles:{fillColor:RED_BG, textColor:RED_C,   fontStyle:"bold", fontSize:8.5},
    columnStyles:{
      0:{cellWidth:52, fontStyle:"bold", textColor:TSEC},
      1:{cellWidth:38, halign:"right",   fontStyle:"bold", textColor:RED_C},
    },
    alternateRowStyles:{fillColor:GREY_BG},
    tableLineColor:BORD, tableLineWidth:0.2,
    didParseCell(d){
      if(d.section==="body"&&!d.row.raw[0]&&!d.row.raw[1])
        { d.cell.styles.fillColor=WHITE; d.cell.styles.lineWidth=0; }
    },
  });
  y=Math.max(lY,doc.lastAutoTable.finalY)+4;

  // 5. NET PAY  — soft green card (not dark)
  fillStroke(doc,ML,y,CW,18,GREEN_BG,GREEN_C,0.5,2);
  fill(doc,ML,y,3,18,GREEN_C,0);          // left green accent bar
  sf(doc,10.5,"bold",GREEN_C);
  tx(doc,"NET SALARY : Rs. "+f2(entry.net_pay),ML+8,y+7.5);
  sf(doc,7.5,"normal",TSEC);
  tx(doc,"In Words: "+inWords(entry.net_pay),ML+8,y+13.5);
  y+=18+3;

  // Employer contributions strip
  const ePF=n0(entry.employer_pf), eESIC=n0(entry.er_esic);
  if(ePF+eESIC>0){
    fillStroke(doc,ML,y,CW,7.5,BLUE_BG,BORD,0.2);
    sf(doc,7,"normal",TLBL);
    tx(doc,
      "Employer PF: Rs."+f0(ePF)+"   |   Employer ESIC: Rs."+f0(eESIC)
      +"   |   Total CTC: Rs."+f0(n0(entry.net_pay)+n0(entry.total_deductions)+ePF+eESIC),
      ML+5,y+4.8);
    y+=7.5+2;
  }

  // FOOTER
  const total=doc.internal.getNumberOfPages();
  for(let i=1;i<=total;i++){ doc.setPage(i); drawFooter(doc,company,i,total); }

  doc.save("SalarySlip_"+(entry.employee_code||entry.employee_id)+"_"+slug(run)+".pdf");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ATTENDANCE & LOP REPORT  (Landscape A4)
// ═══════════════════════════════════════════════════════════════════════════════
export async function downloadAttendanceReport(entry,run,attData=null,emp=null,company={}) {
  const doc      = new jsPDF({unit:"mm",format:"a4",orientation:"landscape",compress:true});
  const logoData = await loadLogo(company.logoUrl);

  const PW=LPW,PH=LPH,ml=LML,mr=LMR,cw=LCW;

  let y=drawHeader(doc,logoData,company,
    "ATTENDANCE & LOP REPORT",
    mfull(run),PW,ml,mr);
  y+=3;

  // ── EMPLOYEE DETAILS ──
  y=sectionTitle(doc,y,"EMPLOYEE DETAILS","",PW,ml,cw);

  const empNm  = entry.employee_name??("Employee #"+entry.employee_id);
  const empCd  = entry.employee_code?"#"+entry.employee_code:"#"+entry.employee_id;
  const desig  = emp?.designation?.title??"-";
  const dept   = emp?.department?.name??"-";
  const grade  = emp?.grade??"-";
  const shiftNm= attData?.shift_info??emp?.shift??"-";

  autoTable(doc,{
    startY:y, margin:{left:ml,right:mr},
    body:[
      ["EMP NAME",  empNm,     "DESIGNATION",  desig,      "DEPARTMENT",   dept    ],
      ["EMP CODE",  empCd,     "GRADE/LEVEL",  grade,      "SHIFT",        shiftNm ],
      ["PERIOD",    mfull(run),"SALARY CYCLE", cycle(run), "REPORT DATE",  today() ],
    ],
    styles:{fontSize:8, cellPadding:{top:3,bottom:3,left:4,right:4}, lineColor:BORD, lineWidth:0.2, valign:"middle"},
    columnStyles:{
      0:{cellWidth:28, fillColor:GREY_BG, textColor:TLBL, fontStyle:"bold", fontSize:7},
      1:{cellWidth:62, fillColor:WHITE,   textColor:TPRI},
      2:{cellWidth:30, fillColor:GREY_BG, textColor:TLBL, fontStyle:"bold", fontSize:7},
      3:{cellWidth:62, fillColor:WHITE,   textColor:TPRI},
      4:{cellWidth:28, fillColor:GREY_BG, textColor:TLBL, fontStyle:"bold", fontSize:7},
      5:{cellWidth:67, fillColor:WHITE,   textColor:TPRI},
    },
    tableLineColor:BORD, tableLineWidth:0.2,
  });
  y=doc.lastAutoTable.finalY+4;

  // ── SUMMARY CARDS (10 white cards, 2 rows of 5) ──
  y=sectionTitle(doc,y,"ATTENDANCE SUMMARY","Cycle: "+cycle(run),PW,ml,cw);

  const lopDays=n0(entry.lop_days), otH=n0(entry.ot_hours);
  const prSc=n0(attData?.total_present??0), abSc=n0(attData?.total_absent??0);
  const lvSc=n0(attData?.total_leave??0);
  const attPct=(prSc+abSc+lvSc)>0?Math.round(prSc/(prSc+abSc+lvSc)*100)+"%":"N/A";

  const CARD_GAP=3, CARD_H=19;

  // Row 1
  const row1=[
    {label:"MONTH DAYS",  value:String(cycleTotalDays(run)), accent:BLUE_C  },
    {label:"PRESENT",     value:String(attData?.total_present??"-"), accent:GREEN_C},
    {label:"ABSENT",      value:String(attData?.total_absent??"-"),  accent:abSc>0?RED_C:TLBL},
    {label:"PAID LEAVE",  value:String(attData?.total_leave??"-"),   accent:PURP_C },
    {label:"HOLIDAYS",    value:String(attData?.total_holidays??"-"),accent:BLUE_C },
  ];
  // Row 2
  const row2=[
    {label:"WEEK OFFS",   value:String(attData?.total_wo??"-"),      accent:TLBL   },
    {label:"HALF DAYS",   value:String(attData?.total_halfday??"-"), accent:AMBER_C},
    {label:"OT HOURS",    value:otFmt(otH),                          accent:n0(otH)>0?GREEN_C:TLBL},
    {label:"ATTENDANCE %",value:attPct,                              accent:BLUE_C },
    {label:"LOP DAYS",    value:lopDays>0?lopDays.toFixed(2):"0.00",accent:lopDays>0?RED_C:TLBL},
  ];
  [row1,row2].forEach((row,ri)=>{
    const n=row.length, w=(cw-(n-1)*CARD_GAP)/n;
    row.forEach(({label,value,accent},i)=>{
      const cx=ml+i*(w+CARD_GAP), cy=y+ri*(CARD_H+3);
      fillStroke(doc,cx,cy,w,CARD_H,WHITE,BORD,0.25,2);
      fill(doc,cx,cy,w,2.5,accent,0);
      sf(doc,5.8,"normal",TLBL);  tx(doc,label,cx+w/2,cy+7.5,{align:"center"});
      sf(doc,10,"bold",accent);   tx(doc,String(value),cx+w/2,cy+14.5,{align:"center"});
    });
  });
  y+=2*(CARD_H+3)+2;

  // ── PAYROLL IMPACT (two white summary cards side-by-side) ──
  y=sectionTitle(doc,y,"PAYROLL IMPACT","",PW,ml,cw);

  const lopItems=[
    {l:"Monthly Gross",            v:"Rs."+f2(entry.gross),          c:TPRI  },
    {l:"Per Day Salary",           v:"Rs."+f2(entry.per_day_salary), c:TPRI  },
    {l:"Total LOP Days",           v:lopDays>0?lopDays.toFixed(3)+" d":"Nil", c:lopDays>0?RED_C:GREEN_C},
    {l:"LOP Deduction",            v:lopDays>0?"- Rs."+f2(entry.lop_amount):"Nil", c:lopDays>0?RED_C:GREEN_C},
    {l:"Actual Gross (after LOP)", v:"Rs."+f2(entry.actual_gross??entry.total_earnings), c:TPRI},
    {l:"OT Earnings Added",        v:n0(entry.ot_amount)>0?"+ Rs."+f2(entry.ot_amount):"Nil", c:n0(entry.ot_amount)>0?GREEN_C:TLBL},
  ];
  const impItems=[
    {l:"Total Earnings",   v:"Rs."+f2(entry.total_earnings),    c:TPRI  },
    {l:"Total Deductions", v:"- Rs."+f2(entry.total_deductions),c:RED_C },
    {l:"Net Salary",       v:"Rs."+f2(entry.net_pay),           c:GREEN_C},
    {l:"Employer PF",      v:n0(entry.employer_pf)>0?"Rs."+f2(entry.employer_pf):"-", c:TPRI},
    {l:"Employer ESIC",    v:n0(entry.er_esic)>0?"Rs."+f2(entry.er_esic):"-",         c:TPRI},
    {l:"Total CTC",        v:"Rs."+f2(n0(entry.net_pay)+n0(entry.total_deductions)+n0(entry.employer_pf)+n0(entry.er_esic)), c:BLUE_C},
  ];

  const panelH=(lopItems.length)*6.2+14, panelW=(cw-4)/2;

  // Left panel: LOP Calculation
  fillStroke(doc,ml,y,panelW,panelH,WHITE,BORD,0.25,2);
  fill(doc,ml,y,panelW,6,BLUE_BG,0);
  sf(doc,7.5,"bold",NAVY_MID); tx(doc,"LOP CALCULATION",ml+panelW/2,y+4.5,{align:"center"});
  hline(doc,ml,ml+panelW,y+6,BORD,0.2);
  let iy=y+11;
  lopItems.forEach(({l,v,c},idx)=>{
    if(idx%2===1) fill(doc,ml,iy-3.5,panelW,6.2,GREY_BG,0);
    sf(doc,7.5,"normal",TLBL); tx(doc,l,ml+6,iy);
    sf(doc,7.5,"bold",c);      tx(doc,v,ml+panelW-6,iy,{align:"right"});
    iy+=6.2;
  });

  // Right panel: Payroll Summary
  const rx=ml+panelW+4;
  fillStroke(doc,rx,y,panelW,panelH,WHITE,BORD,0.25,2);
  fill(doc,rx,y,panelW,6,GREEN_BG,0);
  sf(doc,7.5,"bold",GREEN_C); tx(doc,"PAYROLL SUMMARY",rx+panelW/2,y+4.5,{align:"center"});
  hline(doc,rx,rx+panelW,y+6,BORD,0.2);
  let ry=y+11;
  impItems.forEach(({l,v,c},idx)=>{
    if(idx%2===1) fill(doc,rx,ry-3.5,panelW,6.2,GREY_BG,0);
    const isNet=l==="Net Salary";
    if(isNet){
      fill(doc,rx,ry-3.5,panelW,6.2,GREEN_BG,0);
      sf(doc,8,"bold",GREEN_C); tx(doc,l,rx+6,ry);
      sf(doc,8,"bold",GREEN_C); tx(doc,v,rx+panelW-6,ry,{align:"right"});
    } else {
      sf(doc,7.5,"normal",TLBL); tx(doc,l,rx+6,ry);
      sf(doc,7.5,"bold",c);      tx(doc,v,rx+panelW-6,ry,{align:"right"});
    }
    ry+=6.2;
  });

  y+=panelH+5;

  // ── HORIZONTAL ATTENDANCE MATRIX ──
  if(attData?.days?.length>0){
    y=sectionTitle(doc,y,"DAY-WISE ATTENDANCE MATRIX","",PW,ml,cw);

    const days=attData.days, nDays=days.length;
    const LBL_W=24;
    const dayW=Math.max(6.5, (cw-LBL_W)/nDays);

    // Status badge text (short ASCII)
    const statusLabel={P:"P",A:"A",WO:"WO",HOL:"HOL",LV:"LV",HD:"HD"};
    const statuses=days.map(d=>{
      if(d.is_holiday)                                   return "HOL";
      if(d.is_weekend||d.status==="WO"||d.status==="WOP") return "WO";
      return {P:"P",A:"A",HD:"HD",LV:"LV"}[d.status]??(d.status??"?");
    });
    const dayNames =days.map(d=>d.day_name?.slice(0,2)??"");
    const inTimes  =days.map((d,i)=>{
      const s=statuses[i];
      if(s==="HOL"||s==="WO") return "-";
      return d.in_time  ? d.in_time.slice(0,5)  : "-";
    });
    const outTimes =days.map((d,i)=>{
      const s=statuses[i];
      if(s==="HOL"||s==="WO") return "-";
      return d.out_time ? d.out_time.slice(0,5) : "-";
    });
    const worked   =days.map(d=>{
      const m=n0(d.working_minutes);
      if(!m) return "-";
      return Math.floor(m/60)+"h"+(m%60?"+"+(m%60)+"m":"");
    });
    const ot       =days.map(d=>n0(d.ot_minutes)>0?(d.ot_minutes/60).toFixed(1)+"h":"-");
    const late     =days.map(d=>n0(d.late_by_minutes)>0?d.late_by_minutes+"m":"-");

    // head row 1: group header spanning all day cols
    const headRow1=[
      {content:"",styles:{fillColor:GREY_BG,textColor:TLBL,fontStyle:"bold"}},
      {content:"ATTENDANCE MATRIX - "+mfull(run).toUpperCase(),colSpan:nDays,
       styles:{fillColor:BLUE_BG,textColor:NAVY_MID,fontStyle:"bold",halign:"center"}},
    ];
    // head row 2: date numbers
    const headRow2=["DATE",...days.map(d=>d.date?d.date.slice(8):"")];

    const matrixBody=[
      ["DAY",     ...dayNames ],
      ["IN",      ...inTimes  ],
      ["OUT",     ...outTimes ],
      ["WORKED",  ...worked   ],
      ["OT",      ...ot       ],
      ["LATE",    ...late     ],
      ["STATUS",  ...statuses ],
    ];

    const colStyles={
      0:{cellWidth:LBL_W, fillColor:GREY_BG, textColor:TLBL, fontStyle:"bold", fontSize:6.5, halign:"left"},
    };
    days.forEach((_,i)=>{ colStyles[i+1]={cellWidth:dayW, halign:"center", fontSize:6}; });

    autoTable(doc,{
      startY:y, margin:{left:ml,right:mr},
      head:[headRow1,headRow2],
      body:matrixBody,
      styles:{
        fontSize:6, cellPadding:{top:2.2,bottom:2.2,left:1,right:1},
        lineColor:BORD, lineWidth:0.15, textColor:TPRI, halign:"center",
      },
      headStyles:{fillColor:BLUE_BG, textColor:NAVY_MID, fontStyle:"bold", fontSize:6.5, halign:"center"},
      columnStyles:colStyles,
      alternateRowStyles:{fillColor:GREY_BG},
      tableLineColor:BORD, tableLineWidth:0.15,
      didParseCell(d){
        if(d.section==="head"||d.section==="foot") return;
        const rowIdx=d.row.index, colIdx=d.column.index;
        if(colIdx===0) return;
        const s=statuses[colIdx-1];
        const val=String(d.cell.raw??"");

        // Column bg by status
        if(s==="P")   { d.cell.styles.fillColor=WHITE; }
        else if(s==="A")   { d.cell.styles.fillColor=RED_BG; }
        else if(s==="HOL") { d.cell.styles.fillColor=BLUE_BG; }
        else if(s==="WO")  { d.cell.styles.fillColor=[241,245,249]; d.cell.styles.textColor=TMUT; }
        else if(s==="LV")  { d.cell.styles.fillColor=PURP_BG; }
        else if(s==="HD")  { d.cell.styles.fillColor=AMBER_BG; }

        // STATUS row — badge style
        if(rowIdx===6){
          d.cell.styles.fontStyle="bold";
          if(s==="P")   { d.cell.styles.fillColor=GREEN_BG; d.cell.styles.textColor=GREEN_C; }
          if(s==="A")   { d.cell.styles.fillColor=RED_BG;   d.cell.styles.textColor=RED_C;   }
          if(s==="HOL") { d.cell.styles.fillColor=BLUE_BG;  d.cell.styles.textColor=BLUE_C;  }
          if(s==="WO")  { d.cell.styles.fillColor=[241,245,249]; d.cell.styles.textColor=TLBL; }
          if(s==="LV")  { d.cell.styles.fillColor=PURP_BG;  d.cell.styles.textColor=PURP_C;  }
          if(s==="HD")  { d.cell.styles.fillColor=AMBER_BG; d.cell.styles.textColor=AMBER_C; }
        }
        // OT row highlight
        if(rowIdx===4&&val!=="-"){ d.cell.styles.textColor=GREEN_C; d.cell.styles.fontStyle="bold"; }
        // LATE row highlight
        if(rowIdx===5&&val!=="-"){ d.cell.styles.textColor=RED_C;   d.cell.styles.fontStyle="bold"; }
      },
      // Repeat header on every new page
      didDrawPage(data){
        if(data.pageNumber>1){
          // Light continuation header
          fill(doc,0,0,PW,10,BLUE_BG);
          sf(doc,7,"bold",NAVY_MID);
          tx(doc,(company.name??"")+" - ATTENDANCE MATRIX - "+mfull(run)+" (continued)",ml+2,7);
          fill(doc,0,10,PW,0.8,[147,197,253]);
        }
      },
    });
    y=doc.lastAutoTable.finalY+4;

    // Status legend
    const leg=[
      {l:"Present",  fc:GREEN_BG, tc:GREEN_C},
      {l:"Absent",   fc:RED_BG,   tc:RED_C  },
      {l:"Holiday",  fc:BLUE_BG,  tc:BLUE_C },
      {l:"Week Off", fc:[241,245,249],tc:TLBL},
      {l:"Leave",    fc:PURP_BG,  tc:PURP_C },
      {l:"Half Day", fc:AMBER_BG, tc:AMBER_C},
    ];
    if(y+8<PH-14){
      const lw=(cw-2*(leg.length-1))/leg.length;
      leg.forEach(({l,fc,tc},i)=>{
        const lx=ml+i*(lw+2);
        fillStroke(doc,lx,y,lw,6.5,fc,BORD,0.2,1.5);
        sf(doc,6.5,"bold",tc); tx(doc,l,lx+lw/2,y+4.5,{align:"center"});
      });
      y+=11;
    }
  }

  // Net salary strip (light green)
  if(y+12<PH-14){
    fillStroke(doc,ml,y,cw,11,GREEN_BG,GREEN_C,0.4,2);
    fill(doc,ml,y,3,11,GREEN_C,0);
    sf(doc,8.5,"bold",GREEN_C);
    tx(doc,"NET SALARY: Rs."+f2(entry.net_pay)+"   |   "+inWords(entry.net_pay),
       ml+8,y+7.5);
    y+=11+3;
  }

  const total=doc.internal.getNumberOfPages();
  for(let i=1;i<=total;i++){
    doc.setPage(i);
    drawFooter(doc,company,i,total,PW,ml,mr,PH);
  }

  doc.save("AttLOP_"+(entry.employee_code||entry.employee_id)+"_"+slug(run)+".pdf");
}
