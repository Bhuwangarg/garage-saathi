/* Tests for the extension's logic. Run: TZ=Asia/Kolkata node redpro-extension/test_lib.js */
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const R = require('./lib.js');

let fails = 0;
const check = (name, cond) => { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; };
const none = (obj, ...vals) => !vals.some((v) => JSON.stringify(obj).includes(v));

// Shapes from redPro (8 Oct 2026) with every personal value replaced.
const REVIEW = { tin: 'TVB276345240', pnr: '251402880', name: 'Some Passenger', mobileNo: '919000000001',
  sourceLocation: 'Lucknow', destinationLocation: 'Kanpur (Uttar Pradesh)', dojInLocal: '2026-10-07 06:15:00',
  finalFare: '249', routeId: '46346772', reviewId: '770001', reviewStatus: 'CONFIRMED', seatName: ['L10', 'L9'],
  ratingData: { value: 2, submittedOn: '2026-10-07T14:30:56' },
  reviewData: { userComment: 'Bus felt cheap', opReply: { reply: 'Thank you', status: 'NEW' }, tags: ['Cleanliness'] } };
const COMPLAINT = { custName: 'Some Passenger', custEmailId: 'p@example.com', phoneNo: '9000000002', doj: '2026-09-08 03:00:00',
  status: 'Closed', createdDateTime: '2026-09-08 02:35:46', subIssueType: 'I was not allowed to board the bus', caseNumber: '33967620',
  pnr: '248659731', source: 'Rampur', destination: 'Muzaffarnagar', ticketAmount: 'INR 1048.95', noOfSeats: 1,
  caseComment: [{ commentorName: 'Agent Name', comment: 'Called BO', createdTime: '2026-09-08 20:04:25' }] };
const ASSIGN = { serviceNo: 'MHLKOTA-RISHIKESH-0500PM', originCity: 'Kota', destCity: 'Rishikesh', startTime: '17:00:00',
  vehicleNo: 'MP44ZF2103', driver1Name: 'Bheru', driver1Mobile: '9000000003', croMobile: '9000000004', serviceID: '125687', isRunning: true };

const r = R.mapReview(REVIEW);
check('review: no passenger name or phone', none(r, 'Some Passenger', '919000000001') && !('name' in r) && !('mobileNo' in r));
check('review: keeps PNR, route, boarding time, stars, tags', r.pnr === '251402880' && r.routeId === '46346772' && r.boardAt === '2026-10-07 06:15:00' && r.stars === 2 && r.tags[0] === 'Cleanliness' && r.replied);
const c = R.mapComplaint(COMPLAINT);
check('complaint: no customer details, no agent name', none(c, 'Some Passenger', 'p@example.com', '9000000002', 'Agent Name'));
check('complaint: notes keep time and text', JSON.stringify(c.notes) === JSON.stringify([{ at: '2026-09-08 20:04:25', text: 'Called BO' }]));
const a = R.mapAssignment(ASSIGN);
check('assignment: names kept, phones dropped', a.driver1 === 'Bheru' && none(a, '9000000003', '9000000004') && a.serviceId === '125687');

// Shapes from redPro's Ratings page, 16 Oct 2026 (ratings and sales numbers dropped).
const PAGE = { count: 91, data: [
  { serviceid: '125686', RtId: 46169996, mainRouteId: 46169996, directRouteId: 46169996, viaRouteCnt: 10, isMainRoute: true, DepTMnt: ['1290'],
    ServiceDetails: { SrcNm: 'Meerut', DestNm: 'Jaipur (Rajasthan)', SrcId: 79617, DestId: 807 } },
  { serviceid: '28624', RtId: 9883198, mainRouteId: 9883198, viaRouteCnt: 1, isMainRoute: true, DepTMnt: ['1335'],
    ServiceDetails: { SrcNm: 'Jaipur (Rajasthan)', DestNm: 'Udaipur' } }] };
const VIA = { 0: { RtId: 46169996, serviceid: '125686', isMainRoute: true, DepTMnt: ['1290'] },
  1: { RtId: 46169989, serviceid: '125686', isMainRoute: false, DepTMnt: ['1420'], ServiceDetails: { SrcNm: 'Delhi' } },
  2: { RtId: 46169994, serviceid: '125686', isMainRoute: false, DepTMnt: ['60'], ServiceDetails: { SrcNm: 'Gurugram (Gurgaon)' } } };
const svcs = R.parseServicePage(PAGE);
check('service page: id, main route, start time, places', svcs.length === 2 && svcs[0].serviceId === '125686' && svcs[0].mainRouteId === '46169996'
  && svcs[0].startTime === '21:30:00' && svcs[0].origin === 'Meerut' && svcs[0].viaCount === 10);
check('via routes read from the numbered-object answer', JSON.stringify(R.parseViaRoutes(VIA)) === '["46169996","46169989","46169994"]');
const row = R.serviceRow(svcs[0], R.parseViaRoutes(VIA));
check('a service lists its main route and every via route once', JSON.stringify(row.routeIds) === '["46169989","46169994","46169996"]' && row.label === '21:30, Meerut - Jaipur (Rajasthan)');
check('a service with no via routes keeps its own route', JSON.stringify(R.serviceRow(svcs[1], []).routeIds) === '["9883198"]');
check('minutes → the assignment list\'s time form', R.hhmmss(1290) === '21:30:00' && R.hhmmss(60) === '01:00:00' && R.hhmmss('x') === '');
check('request bodies are what redPro sent', JSON.stringify(R.servicePageBody(1)) === '{"page":1,"sortColumn":"sales","sortOrder":"desc","sid":0,"did":0}'
  && JSON.stringify(R.viaRouteBody('46169996')) === '{"routeId":46169996,"sortColumn":"sales","sortOrder":"desc"}');
check('an empty via-route answer gives no routes', R.parseViaRoutes(null).length === 0);
check('an empty or odd answer gives no services', R.parseServicePage({ data: [] }).length === 0 && R.parseServicePage(null).length === 0);

const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
check('never ran → due', ['reviews', 'complaints', 'services'].every((j) => R.due(j, at(2026, 10, 8, 10, 0), {})));
check('slot already done → not due', !R.due('reviews', at(2026, 10, 8, 12, 0), { reviews: { last: at(2026, 10, 8, 6, 20) } }));
check('next slot → due', R.due('reviews', at(2026, 10, 8, 18, 16), { reviews: { last: at(2026, 10, 8, 6, 20) } }));
check('missed slot caught up within 6 h', R.due('complaints', at(2026, 10, 8, 15, 0), { complaints: { last: at(2026, 10, 8, 7, 31) } }));
check('missed slot older than 6 h → skipped', !R.due('complaints', at(2026, 10, 8, 6, 0), { complaints: { last: at(2026, 10, 7, 19, 31) } }));
check('assignments hourly', R.due('assignments', at(2026, 10, 8, 21, 0), { assignments: { last: at(2026, 10, 8, 20, 0) } })
  && !R.due('assignments', at(2026, 10, 8, 20, 30), { assignments: { last: at(2026, 10, 8, 20, 0) } }));
check('no assignment reads 02:00–05:00', !R.due('assignments', at(2026, 10, 8, 3, 0), {}));

check('first reviews run reads 45 days', R.reviewWindow(at(2026, 10, 8, 6, 15), {}).start === 20260824);
check('morning run reads 14 days', R.reviewWindow(at(2026, 10, 8, 6, 15), { reviews: { last: 1 } }).start === 20260924);
check('evening run reads 3 days', R.reviewWindow(at(2026, 10, 8, 18, 15), { reviews: { last: 1 } }).start === 20261005);
check('reviews body is what redPro sent on 8 Oct', JSON.stringify(R.reviewsBody({ start: 20260917, end: 20261008 })) ===
  '{"filterBy":{"operatorId":"5269","startDateInLong":20260917,"endDateInLong":20261008,"country":"IND","status":"all"},"sortBy":{"doj":true},"orderBy":{"order":"DESC"},"countValue":true}');

check('badge: problem shows !', R.badge({ problem: 'redPro signed out' }, Date.now()).text === '!');
check('badge: recent sync OK', R.badge({ assignments: { last: at(2026, 10, 8, 20, 0) } }, at(2026, 10, 8, 20, 30)).text === 'OK');
check('badge: 4 h without a sync is OLD', R.badge({ assignments: { last: at(2026, 10, 8, 14, 0) } }, at(2026, 10, 8, 18, 30)).text === 'OLD');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
