$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3100'
$pass = 0; $fail = 0
function Check($name, $cond) { if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" } }
function Call($method, $path, $body, $sess) {
  $p = @{ Uri = "$base$path"; Method = $method; WebSession = $sess; UseBasicParsing = $true }
  if ($body) { $p.Body = ($body | ConvertTo-Json -Depth 6); $p.ContentType = 'application/json; charset=utf-8' }
  try { $r = Invoke-WebRequest @p; return @{ code = [int]$r.StatusCode; json = ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json) } }
  catch {
    $resp = $_.Exception.Response; $code = if ($resp) { [int]$resp.StatusCode } else { 0 }; $j = $null
    try { $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8); $j = $sr.ReadToEnd() | ConvertFrom-Json } catch { }
    return @{ code = $code; json = $j }
  }
}
function NewSession() { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

$club = (Call 'GET' '/api/public/club' $null (NewSession)).json
$ha = $club.members | Where-Object { $_.name -eq '김하늘' }
$seo = $club.members | Where-Object { $_.name -eq '박서진' }
$jung = $club.members | Where-Object { $_.name -eq '정유나' }
$choi = $club.members | Where-Object { $_.name -eq '최태호' }

# 일반 회원 박서진
$m = NewSession
Check 'login regular' ((Call 'POST' '/api/auth/login' @{ memberId = $seo.id; code = '123456' } $m).code -eq 200)
Check 'consent false at first' ((Call 'GET' '/api/me' $null $m).json.consent -eq $false)
Check 'consent saved' ((Call 'POST' '/api/me/consent' @{} $m).code -eq 200)
Check 'consent true after' ((Call 'GET' '/api/me' $null $m).json.consent -eq $true)

$d0 = (Call 'GET' '/api/events/evt-workshop' $null $m).json
Check 'detail has 3 activities' ($d0.activities.Count -eq 3)
Check 'account hidden before apply' ([string]::IsNullOrEmpty($d0.event.account))
Check 'apply null before' ($null -eq $d0.apply)
Check 'no fee alert before apply' ($d0.feeDue -eq $false)

Check 'bad day rejected' ((Call 'POST' '/api/events/evt-workshop/apply' @{ answer = '참석'; days = @('2026-12-20') } $m).code -eq 400)
Check 'apply attend' ((Call 'POST' '/api/events/evt-workshop/apply' @{ answer = '참석' } $m).code -eq 200)
Check 'apply days 11,12' ((Call 'POST' '/api/events/evt-workshop/apply' @{ answer = '참석'; days = @('2026-12-11', '2026-12-12') } $m).code -eq 200)
$d1 = (Call 'GET' '/api/events/evt-workshop' $null $m).json
Check 'days saved' ($d1.apply.days.Count -eq 2)
Check 'account visible after attend' ($d1.event.account -like '*000-00-0000*')
Check 'fee alert on' ($d1.feeDue -eq $true)
$list1 = (Call 'GET' '/api/events' $null $m).json.events | Where-Object { $_.id -eq 'evt-workshop' }
Check 'list feeDue true' ($list1.feeDue -eq $true)

# 일반 회원은 관리자 API 불가
Check 'regular blocked from admin members' ((Call 'GET' '/api/admin/members' $null $m).code -eq 403)

# 관리자
$a = NewSession
Check 'login admin' ((Call 'POST' '/api/auth/login' @{ memberId = $ha.id; code = '123456' } $a).code -eq 200)
Check 'admin api blocked before passcode' ((Call 'GET' '/api/admin/members' $null $a).code -eq 403)
Check 'admin unlock' ((Call 'POST' '/api/auth/admin' @{ passcode = 'admin1234' } $a).code -eq 200)
$mem = (Call 'GET' '/api/admin/members' $null $a).json.members
Check 'admin sees 5 members with phone field' ($mem.Count -ge 5 -and ($mem[0].PSObject.Properties.Name -contains 'phone'))

# 입금 확인 -> 알림 사라짐
Check 'pay confirm' ((Call 'POST' '/api/admin/events/evt-workshop/pay' @{ memberId = $seo.id; paid = $true } $a).code -eq 200)
$d2 = (Call 'GET' '/api/events/evt-workshop' $null $m).json
Check 'fee alert gone after pay' ($d2.feeDue -eq $false)
Check 'pay for non-applicant rejected' ((Call 'POST' '/api/admin/events/evt-workshop/pay' @{ memberId = $jung.id; paid = $true } $a).code -eq 400)
Check 'pay cancel' ((Call 'POST' '/api/admin/events/evt-workshop/pay' @{ memberId = $seo.id; paid = $false } $a).code -eq 200)
Check 'fee alert back after cancel' ((Call 'GET' '/api/events/evt-workshop' $null $m).json.feeDue -eq $true)

# 불참으로 변경 -> 날짜 비워짐, 알림 없음
Check 'change to absent' ((Call 'POST' '/api/events/evt-workshop/apply' @{ answer = '불참' } $m).code -eq 200)
$d3 = (Call 'GET' '/api/events/evt-workshop' $null $m).json
Check 'absent clears days and alert' ($d3.apply.days.Count -eq 0 -and $d3.feeDue -eq $false -and [string]::IsNullOrEmpty($d3.event.account))

# 행사 초안은 회원에게 안 보임, 공개하면 보임
$new = (Call 'POST' '/api/admin/events' @{ type = '소모임'; name = '와인 소모임 테스트' } $a).json.event
Check 'draft created' ($null -ne $new.id)
Check 'draft hidden from member' (-not ((Call 'GET' '/api/events' $null $m).json.events | Where-Object { $_.id -eq $new.id }))
Check 'draft detail 404 for member' ((Call 'GET' "/api/events/$($new.id)" $null $m).code -eq 404)
Check 'publish' ((Call 'PATCH' "/api/admin/events/$($new.id)" @{ published = $true; place = '서울' } $a).code -eq 200)
Check 'published visible' (($null -ne ((Call 'GET' '/api/events' $null $m).json.events | Where-Object { $_.id -eq $new.id })))
Check 'bad fee rejected' ((Call 'PATCH' "/api/admin/events/$($new.id)" @{ fee = 'abc' } $a).code -eq 400)

# 원우회 이름 변경
$s = (Call 'GET' '/api/admin/settings' $null $a).json
Check 'settings read' ($s.memberKinds.Count -eq 5)
$put = @{ clubName = '조선 6기 원우회 테스트'; clubShortName = '6기'; inviteCode = '123456'; memberKinds = $s.memberKinds }
Check 'settings put' ((Call 'PUT' '/api/admin/settings' $put $a).code -eq 200)
Check 'club name reflected' ((Call 'GET' '/api/public/club' $null (NewSession)).json.clubName -eq '조선 6기 원우회 테스트')
$put.clubName = 'AI 초격차 전략포럼(ASSF) 제6기 원우회'
Call 'PUT' '/api/admin/settings' $put $a | Out-Null

# 관리자 5명 제한, 모든 권한 관리자 1명 이상
function MemberBody($mm, $perms) { @{ name = $mm.name; kind = $mm.kind; position = $mm.position; gender = ''; company = ''; title = ''; birth = ''; phone = ''; ageGroup = ''; perms = $perms } }
$byId = @{}; $mem | ForEach-Object { $byId[$_.id] = $_ }
Check 'promote 3 more -> 5 admins' (((Call 'PATCH' "/api/admin/members/$($seo.id)" (MemberBody $byId[$seo.id] @('events')) $a).code -eq 200) -and ((Call 'PATCH' "/api/admin/members/$($jung.id)" (MemberBody $byId[$jung.id] @('fees')) $a).code -eq 200) -and ((Call 'PATCH' "/api/admin/members/$($choi.id)" (MemberBody $byId[$choi.id] @('minutes')) $a).code -eq 200))
Check '6th admin rejected' ((Call 'POST' '/api/admin/members' (MemberBody @{ name = '여섯째'; kind = ''; position = '' } @('events')) $a).code -eq 400)
Check 'non-admin member add ok' ((Call 'POST' '/api/admin/members' (MemberBody @{ name = '일반회원'; kind = '정회원'; position = '' } @()) $a).code -eq 200)
$lee = $club.members | Where-Object { $_.name -eq '이도윤' }
Check 'demote one all-admin ok' ((Call 'PATCH' "/api/admin/members/$($lee.id)" (MemberBody $byId[$lee.id] @()) $a).code -eq 200)
Check 'demote last all-admin rejected' ((Call 'PATCH' "/api/admin/members/$($ha.id)" (MemberBody $byId[$ha.id] @()) $a).code -eq 400)
Check 'cannot delete self' ((Call 'DELETE' "/api/admin/members/$($ha.id)" $null $a).code -eq 400)
Check 'cannot delete an admin' ((Call 'DELETE' "/api/admin/members/$($seo.id)" $null $a).code -eq 400)

# 권한 분리: events 권한만 있는 관리자는 회원정보 불가
$e = NewSession
Call 'POST' '/api/auth/login' @{ memberId = $seo.id; code = '123456' } $e | Out-Null
Call 'POST' '/api/auth/admin' @{ passcode = 'admin1234' } $e | Out-Null
Check 'events-only admin: events ok' ((Call 'GET' '/api/admin/events' $null $e).code -eq 200)
Check 'events-only admin: members blocked' ((Call 'GET' '/api/admin/members' $null $e).code -eq 403)
Check 'events-only admin: pay blocked' ((Call 'POST' '/api/admin/events/evt-workshop/pay' @{ memberId = $seo.id; paid = $true } $e).code -eq 403)

# 5회 틀리면 잠금
$l = NewSession
1..5 | ForEach-Object { Call 'POST' '/api/auth/login' @{ memberId = $choi.id; code = 'wrong' } $l | Out-Null }
Check 'locked after 5 fails' ((Call 'POST' '/api/auth/login' @{ memberId = $choi.id; code = '123456' } $l).code -eq 429)

# ===== 3단계: 활동 템플릿과 현장 진행 =====
$tp = (Call 'GET' '/api/admin/templates' $null $a).json.templates
Check 'templates: 3 defaults' ($tp.Count -eq 3)
Check 'member blocked from templates' ((Call 'GET' '/api/admin/templates' $null $m).code -eq 403)
Check 'default template cannot be deleted' ((Call 'DELETE' '/api/admin/templates/time-capsule' $null $a).code -eq 400)

$cfg = @{ name = '아이스브레이킹'; description = '한 줄 키워드'; preEvent = @{ enabled = $false; steps = @() }; onsite = @{ steps = @(@{ key = 'go'; label = '시작'; memberScreen = 'view'; unlock = 'immediate'; hostButton = '시작' }) } }
$ct = (Call 'POST' '/api/admin/templates' $cfg $a)
Check 'create custom template' ($ct.code -eq 200 -and $ct.json.template.version -eq 1)
$ctId = $ct.json.template.id
$cfg.name = '아이스브레이킹 2'
$ut = (Call 'PUT' "/api/admin/templates/$ctId" $cfg $a)
Check 'update template bumps version' ($ut.code -eq 200 -and $ut.json.template.version -eq 2)
$dup = @{ name = '중복'; description = ''; preEvent = @{ enabled = $false; steps = @() }; onsite = @{ steps = @(@{ key = 'x'; label = 'a'; memberScreen = 'wait'; unlock = 'host_click' }, @{ key = 'x'; label = 'b'; memberScreen = 'wait'; unlock = 'host_click' }) } }
Check 'duplicate step keys rejected' ((Call 'POST' '/api/admin/templates' $dup $a).code -eq 400)
$badUnlock = @{ name = '잘못'; description = ''; preEvent = @{ enabled = $false; steps = @() }; onsite = @{ steps = @(@{ key = 'x'; label = 'a'; memberScreen = 'wait'; unlock = 'whenever' }) } }
Check 'invalid unlock value rejected' ((Call 'POST' '/api/admin/templates' $badUnlock $a).code -eq 400)
Check 'delete custom template' ((Call 'DELETE' "/api/admin/templates/$ctId" $null $a).code -eq 200)

$acts = (Call 'GET' '/api/admin/events/evt-workshop/activities' $null $a).json.activities
$cap = $acts | Where-Object { $_.templateId -eq 'time-capsule' }
$who = $acts | Where-Object { $_.templateId -eq 'who-am-i' }
Check 'event has 3 activities' ($acts.Count -eq 3)
Check 'capsule: no pre-event (template setting)' ($cap.pre.enabled -eq $false -and $cap.pre.status -eq 'none')
Check 'who-am-i: pre-event on, window computed' ($who.pre.enabled -eq $true -and $who.pre.opensAt -eq '2026-11-27' -and $who.pre.closesAt -eq '2026-12-04')

$lv0 = (Call 'GET' '/api/events/evt-workshop/live' $null $m).json.activities | Where-Object { $_.name -eq '타임캡슐' }
Check 'member: capsule screen locked at first' ($lv0.live.active -eq $false -and $lv0.live.memberScreen -eq 'wait')
Check 'member cannot press host button' ((Call 'POST' "/api/admin/events/evt-workshop/activities/$($cap.id)/live" @{ action = 'activate'; step = 'write' } $m).code -eq 403)
Check 'unknown step rejected' ((Call 'POST' "/api/admin/events/evt-workshop/activities/$($cap.id)/live" @{ action = 'activate'; step = 'nope' } $a).code -eq 400)

# 기본 템플릿은 '관리자 선택 회원'이라 출석 체크가 필요하다. 3단계 검사는 전체 회원 기준으로 하고, 출석 체크는 6단계에서 따로 검사한다.
$cp3 = $cap.config
Check 'step3: set capsule participants to all members' ((Call 'PATCH' "/api/admin/events/evt-workshop/activities/$($cap.id)" @{ name = $cp3.name; description = $cp3.description; participants = 'all'; preEvent = $cp3.preEvent; onsite = @{ steps = @($cp3.onsite.steps) } } $a).code -eq 200)
$gate3 = Call 'POST' "/api/admin/events/evt-workshop/activities/$($who.id)/live" @{ action = 'activate'; step = 'intro' } $a
Check 'step3: selected-members activity refuses to start before attendance check' ($gate3.code -eq 409 -and $gate3.json.error -like '*출석 체크*')
Check 'host activates capsule write' ((Call 'POST' "/api/admin/events/evt-workshop/activities/$($cap.id)/live" @{ action = 'activate'; step = 'write' } $a).code -eq 200)
$lv1 = (Call 'GET' '/api/events/evt-workshop/live' $null $m).json.activities | Where-Object { $_.name -eq '타임캡슐' }
Check 'member: write screen unlocked after host click' ($lv1.live.unlocked -eq $true -and $lv1.live.memberScreen -eq 'write')
Check 'host locks' ((Call 'POST' "/api/admin/events/evt-workshop/activities/$($cap.id)/live" @{ action = 'lock' } $a).code -eq 200)
$lv2 = (Call 'GET' '/api/events/evt-workshop/live' $null $m).json.activities | Where-Object { $_.name -eq '타임캡슐' }
Check 'member: back to wait after lock' ($lv2.live.unlocked -eq $false -and $lv2.live.memberScreen -eq 'wait')

# 템플릿 설정이 동작을 결정한다: 이 행사에서만 'write' 단계의 회원 화면을 vote 로 바꾸고, 사전 작성을 켠다
$cc = $cap.config
$edit = @{ name = $cc.name; description = $cc.description; preEvent = @{ enabled = $true; opensBeforeDays = 3; closesBeforeDays = 0; steps = @() }
  onsite = @{ steps = @(@{ key = 'write'; label = '작성'; memberScreen = 'vote'; unlock = 'host_click'; hostButton = '작성하기' }, @{ key = 'seal'; label = '봉인'; memberScreen = 'wait'; unlock = 'host_click'; hostButton = '봉인하기' }) } }
Check 'edit activity config for this event' ((Call 'PATCH' "/api/admin/events/evt-workshop/activities/$($cap.id)" $edit $a).code -eq 200)
Call 'POST' "/api/admin/events/evt-workshop/activities/$($cap.id)/live" @{ action = 'activate'; step = 'write' } $a | Out-Null
$lv3 = (Call 'GET' '/api/events/evt-workshop/live' $null $m).json.activities | Where-Object { $_.name -eq '타임캡슐' }
Check 'member screen follows edited setting (vote)' ($lv3.live.memberScreen -eq 'vote')
Check 'pre-event now on for capsule' ($lv3.pre.enabled -eq $true -and $lv3.pre.opensAt -eq '2026-12-08')
$tplAfter = (Call 'GET' '/api/admin/templates' $null $a).json.templates | Where-Object { $_.id -eq 'time-capsule' }
Check 'template library unchanged by event edit' ($tplAfter.config.preEvent.enabled -eq $false)

$removeActive = @{ name = $cc.name; description = ''; preEvent = @{ enabled = $false; steps = @() }; onsite = @{ steps = @(@{ key = 'seal'; label = '봉인'; memberScreen = 'wait'; unlock = 'host_click' }) } }
Check 'cannot delete the running step' ((Call 'PATCH' "/api/admin/events/evt-workshop/activities/$($cap.id)" $removeActive $a).code -eq 400)
Check 'host reset' ((Call 'POST' "/api/admin/events/evt-workshop/activities/$($cap.id)/live" @{ action = 'reset' } $a).code -eq 200)
$lv4 = (Call 'GET' '/api/events/evt-workshop/live' $null $m).json.activities | Where-Object { $_.name -eq '타임캡슐' }
Check 'member: inactive after reset' ($lv4.live.active -eq $false)

# 템플릿에서 활동 추가/빼기
$add = (Call 'POST' '/api/admin/events/evt-workshop/activities' @{ templateId = 'worry-draw' } $a)
Check 'add activity from template' ($add.code -eq 200)
Check 'activity count 4' (((Call 'GET' '/api/admin/events/evt-workshop/activities' $null $a).json.activities).Count -eq 4)
Check 'remove added activity' ((Call 'DELETE' "/api/admin/events/evt-workshop/activities/$($add.json.activity.id)" $null $a).code -eq 200)
Check 'unknown template rejected' ((Call 'POST' '/api/admin/events/evt-workshop/activities' @{ templateId = 'nope' } $a).code -eq 404)

# 권한 분리: 행사 권한만 있는 관리자는 현장 진행은 가능, 템플릿 수정은 불가
Check 'events-only admin can run live' ((Call 'POST' "/api/admin/events/evt-workshop/activities/$($cap.id)/live" @{ action = 'activate'; step = 'write' } $e).code -eq 200)
Check 'events-only admin cannot edit templates' ((Call 'POST' '/api/admin/templates' $cfg $e).code -eq 403)
Check 'events-only admin cannot add activity' ((Call 'POST' '/api/admin/events/evt-workshop/activities' @{ templateId = 'worry-draw' } $e).code -eq 403)

# ===== 4단계: 내가 누굴까요? (AI 키 없이 수동 모드) =====
$aid = $who.id
$memNow = (Call 'GET' '/api/admin/members' $null $a).json.members
$plain = $memNow | Where-Object { $_.name -eq '일반회원' }
function Login($member) { $s = NewSession; Call 'POST' '/api/auth/login' @{ memberId = $member.id; code = '123456' } $s | Out-Null; return $s }
$sJ = Login $jung      # 정유나
$sP = Login $plain     # 일반회원
$sSeo = $m             # 박서진

# 회사/직위 설정 (신원 검사용)
function Upd($mem, $company, $title) { (Call 'PATCH' "/api/admin/members/$($mem.id)" @{ name = $mem.name; kind = $mem.kind; position = $mem.position; gender = ''; company = $company; title = $title; birth = ''; phone = ''; ageGroup = ''; perms = @($mem.perms) } $a).code }
Check 'set company/title for identity check' ((Upd ($memNow | Where-Object { $_.name -eq '정유나' }) '예시상사' '이사') -eq 200)

function SetWin($pre, $guess) {
  $c = $who.config
  $body = @{ name = $c.name; description = $c.description; preEvent = $pre; guessPhase = $guess; onsite = @{ steps = @($c.onsite.steps) }; scoring = $c.scoring }
  (Call 'PATCH' "/api/admin/events/evt-workshop/activities/$aid" $body $a).code
}
$winDefault = @{ enabled = $true; opensBeforeDays = 14; closesBeforeDays = 7; steps = @('alias', 'ai_interview', 'truth_lies', 'reading_optional', 'approve') }
$guessDefault = @{ enabled = $true; opensBeforeDays = 7; closesBeforeDays = 1; steps = @('guess') }
$winOpen = @{ enabled = $true; opensBeforeDays = 60; closesBeforeDays = 1; steps = @('alias', 'ai_interview', 'truth_lies', 'reading_optional', 'approve') }
$guessOpen = @{ enabled = $true; opensBeforeDays = 60; closesBeforeDays = 1; steps = @('guess') }

Check 'activity set to default window' ((SetWin $winDefault $guessDefault) -eq 200)
Check 'alias blocked before window opens' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '평상 위의 독서가' } $sSeo).code -eq 403)
Check 'interview blocked before window opens' ((Call 'POST' "/api/who/$aid/interview" @{} $sSeo).code -eq 403)
Check 'guess list empty before window' (((Call 'GET' "/api/who/$aid/guess" $null $sSeo).json.targets).Count -eq 0)

Check 'open the windows (template-driven)' ((SetWin $winOpen $guessOpen) -eq 200)
$gs = (Call 'GET' "/api/who/$aid" $null $sSeo).json
Check 'state: AI disabled (manual mode)' ($gs.aiEnabled -eq $false)
Check 'state: window open' ($gs.pre.status -eq 'open')

# 별칭
Check 'alias with member name rejected' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '박서진의 하루' } $sSeo).code -eq 400)
Check 'alias with company rejected' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '예시상사 사람' } $sSeo).code -eq 400)
Check 'alias too short rejected' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '가' } $sSeo).code -eq 400)
Check 'interview needs alias first' ((Call 'POST' "/api/who/$aid/interview" @{} $sSeo).code -eq 400)
Check 'alias ok' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '평상 위의 독서가' } $sSeo).code -eq 200)
Check 'duplicate alias rejected (spacing/case ignored)' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '평상위의 독서가' } $sJ).code -eq 400)

# 인터뷰: 필수 질문 8개, 이어쓰기, 저장
$i0 = (Call 'POST' "/api/who/$aid/interview" @{} $sSeo).json.interview
Check 'interview starts with first question' ($i0.messages.Count -eq 1 -and $i0.messages[0].role -eq 'ai' -and $i0.required -eq 8)
$i0b = (Call 'POST' "/api/who/$aid/interview" @{} $sSeo).json.interview
Check 'reopening resumes, no duplicate question' ($i0b.messages.Count -eq 1)
Check 'answer without question rejected for other member' ((Call 'POST' "/api/who/$aid/interview" @{ answer = '안녕' } $sJ).code -eq 400)
$answers = @('여름마다 예시상사 마당에서 수박을 먹었어요.', '새벽에 혼자 산을 오른 적이 있어요.', '아이가 태어난 해가 전환점이었어요.', '작은 실패 뒤에 더 단단해졌어요.', '약속은 지키는 것이 기준이에요.', '오래된 책방 구경을 좋아해요.', '따뜻한 국물과 새벽 공기를 좋아해요.', '약속에 늦는 일을 싫어해요.')
$last = $null
foreach ($t in $answers) { $last = (Call 'POST' "/api/who/$aid/interview" @{ answer = $t } $sSeo).json.interview }
Check 'interview done after 8 answers (no AI follow-ups)' ($last.status -eq 'done' -and $last.answered -eq 8)
Check 'extra answer rejected after done' ((Call 'POST' "/api/who/$aid/interview" @{ answer = '더' } $sSeo).code -eq 409)
$other = (Call 'GET' "/api/who/$aid" $null $sJ).json
Check 'other member cannot see my interview' ($other.interview.messages.Count -eq 0 -and $other.profile.alias -eq '')

# 초안(수동 모드): 신원 일반화
$dr = (Call 'POST' "/api/who/$aid/draft" @{} $sSeo)
Check 'draft generated in manual mode' ($dr.code -eq 200 -and $dr.json.mode -eq 'manual' -and $dr.json.statements.Count -eq 3)
Check 'company generalized in draft' ($dr.json.draftMd -notlike '*예시상사*' -and $dr.json.draftMd -like '*한 회사*')

# 승인: 서버가 신원 정보 재검사
$goodIntro = '여름이면 마당에서 수박을 먹고 평상에 누워 책을 읽던 아이였습니다. 지금도 새벽 산책과 오래된 책방을 좋아합니다.'
$goodSt = @('새벽 산책을 즐깁니다', '마라톤 풀코스를 세 번 완주했습니다', '중고 트럭으로 장사를 시작했습니다')
Check 'approve blocked: company in intro' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = ($goodIntro + ' 예시상사를 키웠습니다.'); statements = $goodSt; lieIndex = 1 } $sSeo).code -eq 422)
Check 'approve blocked: member name in statement' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = $goodIntro; statements = @('새벽 산책을 즐깁니다', '정유나와 친구입니다', '트럭으로 시작했습니다'); lieIndex = 1 } $sSeo).code -eq 422)
Check 'approve blocked: school name' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = ($goodIntro + ' 서울대학교를 나왔습니다.'); statements = $goodSt; lieIndex = 1 } $sSeo).code -eq 422)
Check 'approve blocked: too short' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = '짧아요'; statements = $goodSt; lieIndex = 1 } $sSeo).code -eq 400)
Check 'draft not visible to others before approval' ((((Call 'GET' "/api/who/$aid/guess" $null $sJ).json.targets) | Where-Object { $_.alias -like '*독서가*' }) -eq $null)
Check 'approve ok' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = $goodIntro; statements = $goodSt; lieIndex = 1 } $sSeo).code -eq 200)
Check 'edit blocked while approved' ((Call 'PUT' "/api/who/$aid/draft" @{ introMd = 'x'; statements = $goodSt; lieIndex = 1 } $sSeo).code -eq 409)
Check 'alias change blocked while approved' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '다른 별칭' } $sSeo).code -eq 409)

# 두 번째 회원(정유나)도 작성·승인
Check 'jung alias' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '새벽 산책자' } $sJ).code -eq 200)
Call 'POST' "/api/who/$aid/interview" @{} $sJ | Out-Null
foreach ($t in $answers) { Call 'POST' "/api/who/$aid/interview" @{ answer = $t } $sJ | Out-Null }
Check 'jung draft' ((Call 'POST' "/api/who/$aid/draft" @{} $sJ).code -eq 200)
$jIntro = '새벽 공기를 마시며 걷는 일로 하루를 시작합니다. 약속을 소중히 여기고 따뜻한 국물을 좋아하는 사람입니다.'
Check 'jung approve' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = $jIntro; statements = @('매일 새벽에 걷습니다', '오래된 책방을 즐겨 찾습니다', '고양이 세 마리와 삽니다'); lieIndex = 2 } $sJ).code -eq 200)

# 일반회원은 별칭만 정함(승인 전): 목록에 보이면 안 됨
Check 'plain alias' ((Call 'POST' "/api/who/$aid/alias" @{ alias = '아직 쓰는 중' } $sP).code -eq 200)

# 사전 추측
$gl = (Call 'GET' "/api/who/$aid/guess" $null $sP).json
$tNames = ($gl.targets | ForEach-Object { $_.alias }) -join '|'
Check 'guess list: approved only, 2 targets' ($gl.targets.Count -eq 2 -and $tNames -notlike '*아직*')
Check 'guess list hides identity of authors' ((($gl.targets | ConvertTo-Json -Depth 4) -notmatch '박서진|정유나|memberId'))
Check 'candidates exclude self' (-not ($gl.candidates | Where-Object { $_.id -eq $plain.id }))
$tSeo = $gl.targets | Where-Object { $_.alias -like '*독서가*' }
$cSeo = $gl.candidates | Where-Object { $_.name -eq '박서진' }
$cLee = $gl.candidates | Where-Object { $_.name -eq '이도윤' }
Check 'guess one click' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = $tSeo.profileId; chosenMemberId = $cLee.id } $sP).code -eq 200)
Check 'guess change allowed' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = $tSeo.profileId; chosenMemberId = $cSeo.id } $sP).code -eq 200)
$gl2 = (Call 'GET' "/api/who/$aid/guess" $null $sP).json
Check 'my choice remembered (latest)' ((($gl2.targets | Where-Object { $_.alias -like '*독서가*' }).myChoice) -eq $cSeo.id)
Check 'cannot guess on own post' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = ((Call 'GET' "/api/who/$aid/guess" $null $sSeo).json.targets | Select-Object -First 1).profileId; chosenMemberId = $cLee.id } $sJ).code -eq 400)
$ownList = (Call 'GET' "/api/who/$aid/guess" $null $sSeo).json
Check 'own post excluded from own list' (-not ($ownList.targets | Where-Object { $_.alias -like '*독서가*' }))
Check 'cannot pick self as answer' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = $tSeo.profileId; chosenMemberId = $plain.id } $sP).code -eq 400)
Check 'unknown profile rejected' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = 'nope'; chosenMemberId = $cSeo.id } $sP).code -eq 404)

# 승인 취소 -> 목록에서 사라짐 -> 다시 승인
Check 'unapprove' ((Call 'DELETE' "/api/who/$aid/approve" $null $sSeo).code -eq 200)
Check 'unapproved post disappears from others' (-not ((Call 'GET' "/api/who/$aid/guess" $null $sP).json.targets | Where-Object { $_.alias -like '*독서가*' }))
Check 're-approve' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = $goodIntro; statements = $goodSt; lieIndex = 1 } $sSeo).code -eq 200)

# 수정 요청: 지침 위반은 AI 없이도 거절
$rv1 = (Call 'POST' "/api/who/$aid/revise" @{ request = '회사 이름 예시상사를 넣어 주세요'; introMd = $goodIntro } $sP)
Check 'revise refused: identity (rule check)' ($rv1.code -eq 422 -and $rv1.json.error -like '*관리자 지침에 맞지 않아 반영할 수 없습니다*')
Check 'revise refused: birth date' ((Call 'POST' "/api/who/$aid/revise" @{ request = '생년월일을 넣어 주세요'; introMd = $goodIntro } $sP).code -eq 422)
$rv2 = (Call 'POST' "/api/who/$aid/revise" @{ request = '더 짧게 해 주세요'; introMd = $goodIntro } $sP)
Check 'revise without AI -> manual mode notice' ($rv2.code -eq 503 -and $rv2.json.manual -eq $true)

# 기간 제어 (템플릿 설정)
Check 'guess window -> before' ((SetWin $winOpen @{ enabled = $true; opensBeforeDays = 5; closesBeforeDays = 1; steps = @('guess') }) -eq 200)
Check 'guess POST blocked before guess window' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = $tSeo.profileId; chosenMemberId = $cSeo.id } $sP).code -eq 403)
Check 'guess window -> closed' ((SetWin $winOpen @{ enabled = $true; opensBeforeDays = 60; closesBeforeDays = 40; steps = @('guess') }) -eq 200)
Check 'guess POST blocked after close' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = $tSeo.profileId; chosenMemberId = $cSeo.id } $sP).code -eq 403)
Check 'closed guess list still readable' (((Call 'GET' "/api/who/$aid/guess" $null $sP).json.guess.status) -eq 'closed')
Check 'write window closed blocks edits' ((SetWin @{ enabled = $true; opensBeforeDays = 60; closesBeforeDays = 40; steps = @('alias', 'ai_interview', 'truth_lies', 'reading_optional', 'approve') } $guessOpen) -eq 200)
Check 'approve blocked after write window closed' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = $goodIntro; statements = $goodSt; lieIndex = 1 } $sSeo).code -eq 403)
Check 'restore open windows' ((SetWin $winOpen $guessOpen) -eq 200)

# 관리자 현황(인원 수만)
$pg = (Call 'GET' "/api/admin/events/evt-workshop/activities/$aid/progress" $null $a).json
Check 'progress counts (approved 2, writing 1)' ($pg.approved -eq 2 -and $pg.writing -ge 1 -and $pg.guessers -ge 1)
Check 'progress shows no content' ((($pg | ConvertTo-Json) -notmatch '독서가|새벽'))

# 관리자 질문/지침 설정
$is = (Call 'GET' '/api/admin/interview-settings' $null $a).json
Check 'interview settings: 8 questions, guidelines present' ($is.questions.Count -eq 8 -and $is.guidelines -like '*신원*' -and $is.aiEnabled -eq $false)
Check 'events-only admin can read settings' ((Call 'GET' '/api/admin/interview-settings' $null $e).code -eq 200)
Check 'events-only admin cannot change settings' ((Call 'PUT' '/api/admin/interview-settings' @{ questions = @('Q'); guidelines = 'g'; followUpMax = 1 } $e).code -eq 403)
Check 'empty question rejected' ((Call 'PUT' '/api/admin/interview-settings' @{ questions = @(''); guidelines = 'g'; followUpMax = 1 } $a).code -eq 400)
Check 'admin changes questions' ((Call 'PUT' '/api/admin/interview-settings' @{ questions = @('첫 질문', '둘째 질문'); guidelines = $is.guidelines; followUpMax = 2 } $a).code -eq 200)
# 새 질문은 아직 인터뷰를 시작하지 않은 회원부터 적용된다 (이도윤)
$lee = $memNow | Where-Object { $_.name -eq '이도윤' }
$sL = Login $lee
Call 'POST' "/api/who/$aid/alias" @{ alias = '둘째 질문러' } $sL | Out-Null
$ni = (Call 'POST' "/api/who/$aid/interview" @{} $sL).json.interview
Check 'new questions apply (2 required, first text)' ($ni.required -eq 2 -and $ni.messages[0].text -eq '첫 질문')
Call 'POST' "/api/who/$aid/interview" @{ answer = '답1' } $sL | Out-Null
$nd = (Call 'POST' "/api/who/$aid/interview" @{ answer = '답2' } $sL).json.interview
Check 'interview ends after 2 answers' ($nd.status -eq 'done')

# 활동 카드 정보
$lv = (Call 'GET' '/api/events/evt-workshop/live' $null $sP).json.activities | Where-Object { $_.name -eq '내가 누굴까요?' }
Check 'live card marks who-am-i with windows' ($lv.kind -eq 'who' -and $lv.pre.status -eq 'open' -and $lv.guess.status -eq 'open')
Check 'non-who activity has no kind' (((Call 'GET' '/api/events/evt-workshop/live' $null $sP).json.activities | Where-Object { $_.name -eq '타임캡슐' }).kind -eq '')
Check 'who API rejects non-who activity' ((Call 'GET' "/api/who/$($cap.id)" $null $sP).code -eq 400)

# ===== 5단계: 현장 진행 (사회자 화면, 저예요, 투표, 점수, 룰렛) =====
$R = "/api/admin/events/evt-workshop/activities/$aid"
function Act($action, $target) { $b = @{ action = $action }; if ($target) { $b.targetMemberId = $target }; Call 'POST' "$R/round" $b $a }
function Stage() { (Call 'GET' "$R/stage" $null $a).json }
function MyView($sess) { ((Call 'GET' '/api/events/evt-workshop/live' $null $sess).json.activities | Where-Object { $_.name -eq '내가 누굴까요?' }).round }
function SetSteps($steps) {
  $c = $who.config
  $body = @{ name = $c.name; description = $c.description; preEvent = $winOpen; guessPhase = $guessOpen; onsite = @{ steps = $steps }; scoring = $c.scoring }
  (Call 'PATCH' "/api/admin/events/evt-workshop/activities/$aid" $body $a).code
}

Check 'member blocked from stage' ((Call 'GET' "$R/stage" $null $sSeo).code -eq 403)
Check 'member blocked from round actions' ((Call 'POST' "$R/round" @{ action = 'open' } $sSeo).code -eq 403)
Check 'member blocked from scores' ((Call 'GET' "$R/scores" $null $sSeo).code -eq 403)

# 템플릿에 필요한 단계가 없으면 시작할 수 없다
$allSteps = @($who.config.onsite.steps)
$noVote = @($allSteps | Where-Object { $_.key -ne 'vote' })
Check 'remove vote step from this activity' ((SetSteps $noVote) -eq 200)
$miss = Act 'open' $null
Check 'cannot start without required template steps' ($miss.code -eq 400 -and $miss.json.error -like '*vote*')
Check 'restore steps' ((SetSteps $allSteps) -eq 200)

$s0 = Stage
Check 'stage: no round yet, 2 eligible' ($null -eq $s0.round -and $s0.remaining -eq 2 -and $s0.selectable.Count -eq 2)
Check 'results before opening rejected' ((Act 'results' $null).code -eq 409)
Check 'open round for chosen member' ((Act 'open' $seo.id).code -eq 200)
$s1 = Stage
Check 'intro: alias+intro shown, name hidden' ($s1.round.state -eq 'intro' -and $s1.round.alias -like '*독서가*' -and $s1.round.introMd.Length -gt 10 -and $s1.round.name -eq '' -and $s1.round.nameRevealed -eq $false)
Check 'intro: statements and answer hidden' ($s1.round.statements.Count -eq 0 -and $s1.round.lieIndex -eq -1)
Check 'cannot open another while active' ((Act 'open' $null).code -eq 409)
Check 'cannot close from intro' ((Act 'close' $null).code -eq 409)
Check 'cannot show answer from intro' ((Act 'answer' $null).code -eq 409)
Check 'cannot reveal name during intro' ((Act 'name' $null).code -eq 409)

Check 'show guess results' ((Act 'results' $null).code -eq 200)
$s2 = Stage
Check 'guess results show who picked whom (counts)' ($s2.round.guessTotal -eq 1 -and $s2.round.guessResults[0].name -eq '박서진' -and $s2.round.guessResults[0].count -eq 1)
$v2 = MyView $sP
Check 'member: waits during results, name hidden' ($v2.screen -eq 'wait' -and $v2.name -eq '' -and $v2.lieIndex -eq -1 -and $v2.statements.Count -eq 0)
Check 'member view does not leak target name before reveal' ((($v2 | ConvertTo-Json -Depth 5) -notmatch '박서진'))
Check 'iam rejected for non-target' ((Call 'POST' "/api/who/$aid/iam" @{} $sP).code -eq 403)
Check 'iam rejected before button opens' ((Call 'POST' "/api/who/$aid/iam" @{} $sSeo).code -eq 409)

Check 'open the iam button' ((Act 'ready' $null).code -eq 200)
$vt = MyView $sSeo; $vo = MyView $sP
Check 'target phone shows iam button' ($vt.screen -eq 'iam_button' -and $vt.isTarget -eq $true)
Check 'other phone: not target' ($vo.isTarget -eq $false)
Check 'iam by non-target still rejected' ((Call 'POST' "/api/who/$aid/iam" @{} $sP).code -eq 403)
Check 'target presses iam' ((Call 'POST' "/api/who/$aid/iam" @{} $sSeo).code -eq 200)
$s3 = Stage
Check 'name revealed on host screen' ($s3.round.nameRevealed -eq $true -and $s3.round.name -eq '박서진')
Check 'vote rejected before host opens it' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $sP).code -eq 409)

Check 'host opens voting' ((Act 'vote' $null).code -eq 200)
$s4 = Stage
Check 'host sees statements, answer still hidden' ($s4.round.statements.Count -eq 3 -and $s4.round.lieIndex -eq -1 -and $s4.round.state -eq 'voting')
$vv = MyView $sP
Check 'member vote screen opens, answer hidden' ($vv.screen -eq 'vote' -and $vv.statements.Count -eq 3 -and $vv.lieIndex -eq -1 -and $vv.voted -eq $false)

# 템플릿 설정이 회원 화면을 결정: vote 단계의 회원 화면을 대기로 바꾸면 투표를 받지 않는다
$waitVote = @($allSteps | ForEach-Object { $x = @{ key = $_.key; label = $_.label; memberScreen = $_.memberScreen; unlock = $_.unlock; hostButton = $_.hostButton }; if ($_.key -eq 'vote') { $x.memberScreen = 'wait' }; $x })
Check 'template: set vote screen to wait' ((SetSteps $waitVote) -eq 200)
Check 'vote rejected when template screen is not vote' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $sP).code -eq 409)
Check 'member screen follows template (wait)' ((MyView $sP).screen -eq 'wait')
Check 'template: restore vote screen' ((SetSteps $allSteps) -eq 200)

Check 'target cannot vote' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $sSeo).code -eq 403)
Check 'invalid vote index rejected' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 3 } $sP).code -eq 400)
Check 'plain member votes (lie=2nd)' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $sP).code -eq 200)
Check 'second vote rejected (1 person 1 vote)' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 0 } $sP).code -eq 409)
Check 'jung votes wrong' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 0 } $sJ).code -eq 200)
Check 'lee votes right' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $sL).code -eq 200)
$s5 = Stage
Check 'live vote counts [1,2,0] 3 of 5' (($s5.round.votes.counts -join ',') -eq '1,2,0' -or ($s5.round.votes.counts -join ',') -eq '1,1,1' -or ($s5.round.votes.voted -eq 3))
Check 'vote tally correct' ($s5.round.votes.counts[0] -eq 1 -and $s5.round.votes.counts[1] -eq 2 -and $s5.round.votes.counts[2] -eq 0 -and $s5.round.votes.eligible -eq 5)
Check 'my vote remembered on phone' ((MyView $sP).voted -eq $true -and (MyView $sP).myVote -eq 1)

Check 'host closes voting' ((Act 'close' $null).code -eq 200)
Check 'vote after close rejected' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $a).code -eq 409)
$vc = MyView $sP
Check 'phone locked after close, answer hidden' ($vc.screen -eq 'wait' -and $vc.state -eq 'closed' -and $vc.lieIndex -eq -1)

Check 'host reveals answer' ((Act 'answer' $null).code -eq 200)
$s6 = Stage
Check 'answer: lie index and winners shown' ($s6.round.lieIndex -eq 1 -and $s6.round.correctVoters.Count -eq 2 -and ($s6.round.correctVoters -contains '일반회원') -and ($s6.round.correctVoters -contains '이도윤') -and ($s6.round.correctGuessers -contains '일반회원'))
$va = MyView $sP; $vj = MyView $sJ
Check 'phone shows result: correct' ($va.screen -eq 'view' -and $va.lieIndex -eq 1 -and $va.correct -eq $true)
Check 'phone shows result: wrong' ($vj.correct -eq $false)

# 점수판 / 동점자 룰렛
$sc = (Call 'GET' "$R/scores" $null $a).json
Check 'scores: A winner is plain member (1 point), no tie' ($sc.A.top[0].name -eq '일반회원' -and $sc.A.topScore -eq 1 -and $sc.A.needsRoulette -eq $false)
Check 'scores: B tie of two (plain, lee)' ($sc.B.needsRoulette -eq $true -and $sc.B.tied.Count -eq 2)
Check 'roulette refused when no tie' ((Call 'POST' "$R/scores" @{ category = 'A' } $a).code -eq 400)
$lot = Call 'POST' "$R/scores" @{ category = 'B' } $a
Check 'roulette picks among tied only' ($lot.code -eq 200 -and (@('일반회원', '이도윤') -contains $lot.json.winnerName) -and $lot.json.tied.Count -eq 2)
Check 'roulette cannot be re-run silently' ((Call 'POST' "$R/scores" @{ category = 'B' } $a).code -eq 409)
$sc2 = (Call 'GET' "$R/scores" $null $a).json
Check 'roulette result persists' ($sc2.B.lottery.winnerName -eq $lot.json.winnerName)
Check 'roulette redo allowed explicitly' ((Call 'POST' "$R/scores" @{ category = 'B'; redo = $true } $a).code -eq 200)

# 다음 사람 -> 마지막 사람 -> 더 없음
Check 'next person (random from remaining)' ((Act 'open' $null).code -eq 200)
$n1 = Stage
Check 'next round is the other member' ($n1.round.orderNo -eq 2 -and $n1.round.alias -like '*새벽*' -and $n1.remaining -eq 0)
Check 'finish second round quickly' (((Act 'results' $null).code -eq 200) -and ((Act 'ready' $null).code -eq 200) -and ((Act 'vote' $null).code -eq 200) -and ((Act 'answer' $null).code -eq 200))
Check 'no one left to open' ((Act 'open' $null).code -eq 409)
$sc3 = (Call 'GET' "$R/scores" $null $a).json
Check 'scores count only answered rounds (2 played)' ($sc3.played -eq 2)

# ===== 6단계: 나의 고민은? / 타임캡슐 / 참여 대상(관리자 선택 회원) / 팀 구성 배포 =====
$A6 = '/api/admin/events/evt-workshop/activities'
function PatchCfg($actId, $c, $over) {
  $b = @{ name = $c.name; description = $c.description; participants = $c.participants; preEvent = $c.preEvent; onsite = @{ steps = @($c.onsite.steps) } }
  if ($c.guessPhase) { $b.guessPhase = $c.guessPhase }
  if ($c.scoring) { $b.scoring = $c.scoring }
  foreach ($k in $over.Keys) { $b[$k] = $over[$k] }
  (Call 'PATCH' "$A6/$actId" $b $a).code
}
function Roster($actId, $ids) { Call 'PUT' "$A6/$actId/attendance" @{ selected = @($ids) } $a }
function ConfirmAtt($actId, $v) { Call 'POST' "$A6/$actId/attendance" @{ confirmed = $v } $a }
$acts6 = (Call 'GET' $A6 $null $a).json.activities
$wd = $acts6 | Where-Object { $_.templateId -eq 'worry-draw' } | Select-Object -First 1
$cp = $acts6 | Where-Object { $_.templateId -eq 'time-capsule' } | Select-Object -First 1
$wid = $wd.id; $cid = $cp.id
$ws = "$A6/$wid/worry"
$idP = $plain.id; $idJ = $jung.id; $idL = $lee.id

# 템플릿: 참여 대상 옵션 (전체 회원 / 관리자 선택 회원)
Check 'default templates are admin-selected members' (((Call 'GET' '/api/admin/templates' $null $a).json.templates | Where-Object { $_.id -eq 'time-capsule' }).config.participants -eq 'selected')
$tcfg = @{ name = '전체용 활동'; description = ''; participants = 'all'; preEvent = @{ enabled = $false; steps = @() }; onsite = @{ steps = @(@{ key = 'go'; label = '시작'; memberScreen = 'view'; unlock = 'immediate'; hostButton = '시작' }) } }
$tt = Call 'POST' '/api/admin/templates' $tcfg $a
Check 'template stores participants option (all)' ($tt.code -eq 200 -and $tt.json.template.config.participants -eq 'all')
$tcfg.participants = 'selected'
$tt2 = Call 'POST' '/api/admin/templates' $tcfg $a
Check 'template stores participants option (selected)' ($tt2.code -eq 200 -and $tt2.json.template.config.participants -eq 'selected')
$tcfg.participants = 'attendees'
Check 'old/invalid participants value rejected' ((Call 'POST' '/api/admin/templates' $tcfg $a).code -eq 400)
Call 'DELETE' "/api/admin/templates/$($tt.json.template.id)" $null $a | Out-Null
Call 'DELETE' "/api/admin/templates/$($tt2.json.template.id)" $null $a | Out-Null

# 참석 신청: 일반회원, 정유나, 이도윤은 참석. 박서진은 불참.
foreach ($s6 in @($sP, $sJ, $sL)) { Call 'POST' '/api/events/evt-workshop/apply' @{ answer = '참석' } $s6 | Out-Null }

# 활동 일시는 안내용 정보
Check 'activity date/time saved as info' ((Call 'PUT' "$A6/$wid/schedule" @{ startsAt = '2026-12-11T20:00'; endsAt = '2026-12-11T22:00' } $a).code -eq 200)
Check 'end before start rejected' ((Call 'PUT' "$A6/$wid/schedule" @{ startsAt = '2026-12-11T20:00'; endsAt = '2026-12-11T19:00' } $a).code -eq 400)
Check 'member blocked from schedule edit' ((Call 'PUT' "$A6/$wid/schedule" @{ startsAt = ''; endsAt = '' } $sP).code -eq 403)
$schedLive = ((Call 'GET' '/api/events/evt-workshop/live' $null $sP).json.activities | Where-Object { $_.kind -eq 'worry' })
Check 'member sees the activity time (info only)' ($schedLive.startsAt -eq '2026-12-11T20:00' -and $schedLive.endsAt -eq '2026-12-11T22:00')

# 타임캡슐 설정 복원(3단계 테스트에서 바꿔 둔 것). 기본 설정: 관리자 선택 회원
$capSel = @{ name = '타임캡슐'; description = ''; participants = 'selected'; preEvent = @{ enabled = $false; steps = @() }; onsite = @{ steps = @(@{ key = 'write'; label = '작성'; memberScreen = 'write'; unlock = 'host_click'; hostButton = '타임캡슐 작성하기' }, @{ key = 'seal'; label = '봉인'; memberScreen = 'wait'; unlock = 'host_click'; hostButton = '봉인하기' }) } }
Check 'restore capsule template settings (selected members)' ((Call 'PATCH' "$A6/$cid" $capSel $a).code -eq 200)
Call 'POST' "$A6/$cid/live" @{ action = 'reset' } $a | Out-Null
$kinds = (Call 'GET' '/api/events/evt-workshop/live' $null $sP).json.activities
Check 'activity kinds: who / worry / capsule' ((($kinds | Where-Object { $_.name -eq '내가 누굴까요?' }).kind -eq 'who') -and (($kinds | Where-Object { $_.name -eq '나의 고민은?' }).kind -eq 'worry') -and (($kinds | Where-Object { $_.name -eq '타임캡슐' }).kind -eq 'capsule'))

# ---------- 나의 고민은? (관리자 선택 회원) ----------
$wcfg = $wd.config
$wOpen = @{ enabled = $true; opensBeforeDays = 60; closesBeforeDays = 1; steps = @('worry_write') }
Check 'worry activity default participants = selected' ($wcfg.participants -eq 'selected')
Check 'worry write blocked before window' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 고민'; category = '경영'; anonymous = $false } $sP).code -eq 403)
Check 'open worry window (template)' ((PatchCfg $wid $wcfg @{ preEvent = $wOpen }) -eq 200)
Check 'worry write refused: nobody selected yet' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 고민'; category = '경영'; anonymous = $false } $sP).code -eq 403)
Check 'worry screen reports canJoin=false for unselected' (((Call 'GET' "/api/worry/$wid" $null $sP).json.canJoin) -eq $false)

# 출석 체크(관리자가 참여할 사람을 고른다)
$att0 = (Call 'GET' "$A6/$wid/attendance" $null $a).json
Check 'attendance: nobody selected, not confirmed' ($att0.selectedCount -eq 0 -and $att0.confirmed -eq $false -and $att0.members.Count -ge 5)
Check 'member blocked from attendance admin' ((Call 'GET' "$A6/$wid/attendance" $null $sP).code -eq 403)
Check 'attendance: unknown member rejected' ((Roster $wid @('nope')).code -eq 400)
Check 'attendance confirm refused with nobody selected' ((ConfirmAtt $wid $true).code -eq 409)
Check 'attendance: fill from event applicants (one-time helper)' (((Call 'PUT' "$A6/$wid/attendance" @{ preset = 'applicants' } $a).json.selectedCount) -eq 3)
$att1 = (Call 'GET' "$A6/$wid/attendance" $null $a).json
Check 'attendance: applicants selected, absent member not' ((($att1.members | Where-Object { $_.selected } | ForEach-Object { $_.name } | Sort-Object) -join ',') -eq '이도윤,일반회원,정유나')
Check 'worry screen: selected member canJoin' (((Call 'GET' "/api/worry/$wid" $null $sP).json.canJoin) -eq $true)

Check 'worry: too short rejected' ((Call 'POST' "/api/worry/$wid" @{ body = '가'; category = '경영'; anonymous = $false } $sP).code -eq 400)
Check 'worry: bad category rejected' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 고민'; category = '없는분류'; anonymous = $false } $sP).code -eq 400)
$wAnon = Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET AI 도입이 막막해요 (익명)'; category = 'AI 도입'; anonymous = $true } $sP
Check 'worry: anonymous written' ($wAnon.code -eq 200)
Check 'worry: named written (jung, 경영)' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 후계 구도를 어떻게 준비할까요'; category = '경영'; anonymous = $false } $sJ).code -eq 200)
Check 'worry: named written (lee, 인재)' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 핵심 인력이 떠나요'; category = '인재'; anonymous = $false } $sL).code -eq 200)
Check 'worry: named written (lee, 기타)' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 기타 고민이에요'; category = '기타'; anonymous = $false } $sL).code -eq 200)
Check 'worry: absent (not selected) member cannot write' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 불참자 고민'; category = '기타'; anonymous = $false } $sSeo).code -eq 403)
$mineP = (Call 'GET' "/api/worry/$wid" $null $sP).json
Check 'worry: mine only (1 item, anonymous flag)' ($mineP.mine.Count -eq 1 -and $mineP.mine[0].anonymous -eq $true -and $mineP.max -eq 3)
Check 'worry: edit own' ((Call 'PATCH' "/api/worry/$wid/$($mineP.mine[0].id)" @{ body = 'ZZSECRET AI 도입이 막막해요 (익명, 수정)'; category = 'AI 도입'; anonymous = $true } $sP).code -eq 200)
Check 'worry: cannot edit someone elses' ((Call 'PATCH' "/api/worry/$wid/$($mineP.mine[0].id)" @{ body = 'ZZSECRET 가로채기'; category = '경영'; anonymous = $false } $sJ).code -eq 404)
Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 임시 3'; category = '기타'; anonymous = $false } $sL | Out-Null
Check 'worry: max 3 per member' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 임시 4'; category = '기타'; anonymous = $false } $sL).code -eq 400)
$mineL = (Call 'GET' "/api/worry/$wid" $null $sL).json.mine
foreach ($x in ($mineL | Where-Object { $_.body -like '*임시*' })) { Call 'DELETE' "/api/worry/$wid/$($x.id)" $null $sL | Out-Null }
Check 'worry: delete own (back to 2)' (((Call 'GET' "/api/worry/$wid" $null $sL).json.mine).Count -eq 2)

$w0 = (Call 'GET' $ws $null $a).json
Check 'host stage: nothing drawn, counts only' ($null -eq $w0.current -and $w0.counts.total -eq 4 -and $w0.counts.remaining -eq 4 -and $w0.activity.participants -eq 'selected')
Check 'host stage hides undrawn worry text/authors' ((($w0 | ConvertTo-Json -Depth 6) -notmatch 'ZZSECRET'))
Check 'member blocked from worry host stage' ((Call 'GET' $ws $null $sP).code -eq 403)
Check 'member blocked from worry actions' ((Call 'POST' $ws @{ action = 'draw' } $sP).code -eq 403)

# 활동 전 출석 체크 완료가 필요하다
$gate = Call 'POST' $ws @{ action = 'draw' } $a
Check 'draw refused until attendance check is completed' ($gate.code -eq 409 -and $gate.json.error -like '*출석 체크*')
Check 'complete attendance check' ((ConfirmAtt $wid $true).code -eq 200)
Check 'attendance shows completed' (((Call 'GET' "$A6/$wid/attendance" $null $a).json.confirmed) -eq $true)

# 뽑기: 카테고리 지정, 이미 나온 고민 제외
Check 'reveal before drawing rejected' ((Call 'POST' $ws @{ action = 'reveal' } $a).code -eq 409)
Check 'draw by category (기타 -> lee)' ((Call 'POST' $ws @{ action = 'draw'; category = '기타' } $a).code -eq 200)
$w1 = (Call 'GET' $ws $null $a).json
Check 'drawn worry shows body, author hidden' ($w1.current.body -like '*기타 고민*' -and $w1.current.displayName -eq '' -and $w1.current.nameRevealed -eq $false)
Check 'timer starts at ~15 minutes' ($w1.current.remainingMs -gt 800000 -and $w1.current.remainingMs -le 900000 -and $w1.current.paused -eq $false)
Check 'cannot draw again before name is opened' ((Call 'POST' $ws @{ action = 'draw' } $a).code -eq 409)
Check 'name open refused before time is up' ((Call 'POST' $ws @{ action = 'reveal' } $a).code -eq 409)
Check 'self-reveal refused for a named (non-anonymous) author' ((Call 'POST' "/api/worry/$wid/reveal-self" @{} $sL).code -eq 400)
Check 'pause' ((Call 'POST' $ws @{ action = 'pause' } $a).code -eq 200)
$wp = (Call 'GET' $ws $null $a).json.current
Check 'paused timer holds' ($wp.paused -eq $true -and $wp.remainingMs -gt 800000)
Check 'pause twice rejected' ((Call 'POST' $ws @{ action = 'pause' } $a).code -eq 409)
Check 'resume' ((Call 'POST' $ws @{ action = 'resume' } $a).code -eq 200)
Check 'extend +5 minutes' ((Call 'POST' $ws @{ action = 'extend'; minutes = 5 } $a).code -eq 200)
Check 'timer extended' (((Call 'GET' $ws $null $a).json.current.remainingMs) -gt 1100000)
Check 'AI perspectives refused without AI key' ((Call 'POST' $ws @{ action = 'tips' } $a).code -eq 503)
$wm = ((Call 'GET' '/api/events/evt-workshop/live' $null $sP).json.activities | Where-Object { $_.kind -eq 'worry' }).worry
Check 'member phone sees worry, timer, no author' ($wm.body -like '*기타 고민*' -and $wm.displayName -eq '' -and $wm.remainingMs -gt 1000000 -and $wm.isMine -eq $false)
Check 'skip timer' ((Call 'POST' $ws @{ action = 'skip' } $a).code -eq 200)
Check 'time is up after skip' (((Call 'GET' $ws $null $a).json.current.timeUp) -eq $true)
Check 'reveal name (named author)' ((Call 'POST' $ws @{ action = 'reveal' } $a).code -eq 200)
Check 'named author shown by real name' (((Call 'GET' $ws $null $a).json.current.displayName) -eq '이도윤')

# 익명: 이름 오픈 시 "익명", 작성자가 원하면 직접 밝힘
Check 'draw anonymous worry (AI 도입)' ((Call 'POST' $ws @{ action = 'draw'; category = 'AI 도입' } $a).code -eq 200)
Call 'POST' $ws @{ action = 'skip' } $a | Out-Null
Check 'anonymous author cannot self-reveal before name open' ((Call 'POST' "/api/worry/$wid/reveal-self" @{} $sP).code -eq 409)
Check 'reveal anonymous' ((Call 'POST' $ws @{ action = 'reveal' } $a).code -eq 200)
Check 'anonymous shows 익명' (((Call 'GET' $ws $null $a).json.current.displayName) -eq '익명')
$wmA = ((Call 'GET' '/api/events/evt-workshop/live' $null $sP).json.activities | Where-Object { $_.kind -eq 'worry' }).worry
$wmB = ((Call 'GET' '/api/events/evt-workshop/live' $null $sJ).json.activities | Where-Object { $_.kind -eq 'worry' }).worry
Check 'author sees self-reveal option, others do not' ($wmA.isMine -eq $true -and $wmA.canSelfReveal -eq $true -and $wmB.canSelfReveal -eq $false)
Check 'non-author cannot reveal for them' ((Call 'POST' "/api/worry/$wid/reveal-self" @{} $sJ).code -eq 403)
Check 'author reveals themself' ((Call 'POST' "/api/worry/$wid/reveal-self" @{} $sP).code -eq 200)
Check 'anonymous author now shown by name' (((Call 'GET' $ws $null $a).json.current.displayName) -eq '일반회원')

# 관리자 선택 회원: 선택에서 빠진 사람의 고민은 뽑히지 않는다(늦게 선택하면 바로 뽑힌다)
$wmS = ((Call 'GET' '/api/events/evt-workshop/live' $null $sSeo).json.activities | Where-Object { $_.kind -eq 'worry' })
Check 'unselected member phone: canJoin false, option shown' ($wmS.canJoin -eq $false -and $wmS.participants -eq 'selected' -and $wmS.worry.canJoin -eq $false)
Check 'selected member phone: canJoin true' ((((Call 'GET' '/api/events/evt-workshop/live' $null $sL).json.activities | Where-Object { $_.kind -eq 'worry' }).canJoin) -eq $true)
Check 'deselect lee from the activity' ((Roster $wid @($idP, $idJ)).code -eq 200)
Check 'deselected author worry cannot be drawn' ((Call 'POST' $ws @{ action = 'draw'; category = '인재' } $a).code -eq 409)
Check 'deselected member cannot edit/write anymore' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 빠진 뒤'; category = '기타'; anonymous = $false } $sL).code -eq 403)
Check 'late arrival: select lee again' ((Roster $wid @($idP, $idJ, $idL)).code -eq 200)
Check 'reselected author worry can be drawn' ((Call 'POST' $ws @{ action = 'draw'; category = '인재' } $a).code -eq 200)
Call 'POST' $ws @{ action = 'skip' } $a | Out-Null; Call 'POST' $ws @{ action = 'reveal' } $a | Out-Null
Check 'draw 경영' ((Call 'POST' $ws @{ action = 'draw'; category = '경영' } $a).code -eq 200)
Call 'POST' $ws @{ action = 'skip' } $a | Out-Null; Call 'POST' $ws @{ action = 'reveal' } $a | Out-Null
Check 'nothing left to draw (already drawn are excluded)' ((Call 'POST' $ws @{ action = 'draw' } $a).code -eq 409)
$wEnd = (Call 'GET' $ws $null $a).json
Check 'counts: all drawn, state kept in DB (resume-able)' ($wEnd.counts.remaining -eq 0 -and $wEnd.counts.drawn -eq 4 -and $wEnd.current.orderNo -eq 4)
Check 'drawn worry cannot be edited' ((Call 'PATCH' "/api/worry/$wid/$($mineP.mine[0].id)" @{ body = 'ZZSECRET 이미 뽑힘'; category = 'AI 도입'; anonymous = $true } $sP).code -eq 409)

# 참여 대상을 "전체 회원"으로 바꾸면 출석 체크 없이 누구나 참여한다
Check 'switch worry activity to all members' ((PatchCfg $wid $wcfg @{ preEvent = $wOpen; participants = 'all' }) -eq 200)
Check 'all members: unselected member can write' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET 전체 회원 고민'; category = '기타'; anonymous = $false } $sSeo).code -eq 200)
Check 'all members: host action needs no attendance check' ((Call 'POST' $ws @{ action = 'draw'; category = '기타' } $a).code -eq 200)

# ---------- 타임캡슐 (관리자 선택 회원 + 팀 구성 배포) ----------
$cs = "$A6/$cid"
$capMember = @{ goal = 'ZZGOAL 내년에는 직원들과 해외 워크숍을 갑니다' }
Check 'capsule: write refused while not selected as a participant' ((Call 'PUT' "/api/capsule/$cid" $capMember $sP).code -eq 403)
Check 'capsule: GET shows closed + sealed' ((($g0 = (Call 'GET' "/api/capsule/$cid" $null $sP).json).canWrite -eq $false) -and $g0.opened -eq $false -and $null -eq $g0.content)

Check 'member blocked from teams admin' ((Call 'GET' "$cs/teams" $null $sP).code -eq 403)
Check 'teams: refused when nobody is selected' ((Call 'POST' "$cs/teams" @{ mode = 'random'; size = 2 } $a).code -eq 400)
Check 'capsule attendance: select 3' ((Roster $cid @($idP, $idJ, $idL)).code -eq 200)
Check 'host cannot open writing before attendance check is completed' ((Call 'POST' "$cs/live" @{ action = 'activate'; step = 'write' } $a).code -eq 409)
Check 'capsule attendance: complete' ((ConfirmAtt $cid $true).code -eq 200)
Check 'capsule: selected member, but write refused before host opens it' ((Call 'PUT' "/api/capsule/$cid" $capMember $sP).code -eq 409)

# 팀 구성: 관리자 배정 / 연령대 섞기 / 랜덤 배정
Check 'teams: needs count or size' ((Call 'POST' "$cs/teams" @{ mode = 'random' } $a).code -eq 400)
Check 'teams: invalid mode rejected' ((Call 'POST' "$cs/teams" @{ mode = 'nope'; size = 2 } $a).code -eq 400)
Check 'teams: admin-assign mode makes empty teams' ((Call 'POST' "$cs/teams" @{ mode = 'manual'; count = 2 } $a).code -eq 200)
$tm = (Call 'GET' "$cs/teams" $null $a).json
Check 'admin-assign: 2 empty teams, 3 unassigned, draft' ($tm.teams.Count -eq 2 -and $tm.teams[0].members.Count -eq 0 -and $tm.unassigned.Count -eq 3 -and $tm.published -eq $false -and $tm.poolKind -eq 'selected')
Check 'publish refused: empty teams' ((Call 'POST' "$cs/teams/publish" @{ action = 'publish' } $a).code -eq 409)
Check 'teams: age-mix mode' ((Call 'POST' "$cs/teams" @{ mode = 'mix'; size = 2 } $a).code -eq 200)
$tmx = (Call 'GET' "$cs/teams" $null $a).json
Check 'age-mix: 2 teams, everyone assigned' ($tmx.teams.Count -eq 2 -and $tmx.unassigned.Count -eq 0 -and (($tmx.teams | ForEach-Object { $_.members.Count } | Measure-Object -Sum).Sum -eq 3))
Check 'teams: random mode' ((Call 'POST' "$cs/teams" @{ mode = 'random'; count = 2 } $a).code -eq 200)
$t1 = (Call 'GET' "$cs/teams" $null $a).json
Check 'teams: pool is selected members only' ($t1.participantCount -eq 3 -and $t1.unassigned.Count -eq 0 -and (($t1.teams | ForEach-Object { $_.members } | ForEach-Object { $_.name } | Sort-Object) -join ',') -eq '이도윤,일반회원,정유나')
Check 'manual: same person in two teams rejected' ((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'A팀'; memberIds = @($idP, $idJ) }, @{ name = 'B팀'; memberIds = @($idJ) }) } $a).code -eq 400)
Check 'manual: unknown member rejected' ((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'A팀'; memberIds = @('nope') }) } $a).code -eq 400)
Check 'manual: member outside the selection rejected' ((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'A팀'; memberIds = @($seo.id) }) } $a).code -eq 400)
Check 'manual: duplicate team name rejected' ((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'A팀'; memberIds = @($idP) }, @{ name = 'A팀'; memberIds = @($idJ) }) } $a).code -eq 400)

# 드래그로 옮긴 결과 저장(초안) -> 확인(배포)
Check 'dragged layout saved as draft (someone left out)' ((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'A팀'; memberIds = @($idP, $idJ) }, @{ name = 'B팀'; memberIds = @() }) } $a).code -eq 200)
$pubFail = Call 'POST' "$cs/teams/publish" @{ action = 'publish' } $a
Check 'confirm refused: empty team / unassigned person' ($pubFail.code -eq 409)
Check 'dragged layout (final)' ((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'A팀'; memberIds = @($idP, $idJ) }, @{ name = 'B팀'; memberIds = @($idL) }) } $a).code -eq 200)
Check 'layout is still a draft' (((Call 'GET' "$cs/teams" $null $a).json.published) -eq $false)
Check 'DRAFT: members cannot see their team' ($null -eq ((Call 'GET' "/api/capsule/$cid" $null $sP).json.team))
Check 'confirm publishes the teams' ((Call 'POST' "$cs/teams/publish" @{ action = 'publish' } $a).code -eq 200)
$tp = (Call 'GET' "/api/capsule/$cid" $null $sP).json
Check 'PUBLISHED: member sees team and teammates' ($tp.team.name -eq 'A팀' -and $tp.team.members.Count -eq 2)
Check 'editing after publish returns to draft' (((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'A팀'; memberIds = @($idP, $idJ) }, @{ name = 'B팀'; memberIds = @($idL) }) } $a).code -eq 200) -and ((Call 'GET' "$cs/teams" $null $a).json.published) -eq $false -and $null -eq ((Call 'GET' "/api/capsule/$cid" $null $sP).json.team))
Check 're-publish' ((Call 'POST' "$cs/teams/publish" @{ action = 'publish' } $a).code -eq 200)
Check 'member blocked from publish' ((Call 'POST' "$cs/teams/publish" @{ action = 'publish' } $sP).code -eq 403)

# 작성: 사회자가 열어야 한다 (템플릿 설정)
Check 'host opens capsule writing' ((Call 'POST' "$cs/live" @{ action = 'activate'; step = 'write' } $a).code -eq 200)
Check 'member can write now' (((Call 'GET' "/api/capsule/$cid" $null $sP).json.canWrite) -eq $true)
Check 'goal: empty rejected' ((Call 'PUT' "/api/capsule/$cid" @{ goal = '  ' } $sP).code -eq 400)
Check 'pacts: must be exactly 2' ((Call 'PUT' "/api/capsule/$cid" @{ pacts = @('하나만') } $sP).code -eq 400)
Check 'goal saved (private)' ((Call 'PUT' "/api/capsule/$cid" $capMember $sP).code -eq 200)
Check 'team pacts saved by one teammate' ((Call 'PUT' "/api/capsule/$cid" @{ pacts = @('ZZPACT 분기마다 안부 전화', 'ZZPACT 연 1회 함께 등산') } $sP).code -eq 200)
$gJ = (Call 'GET' "/api/capsule/$cid" $null $sJ).json
Check 'teammate sees team + pact written (no content)' ($gJ.team.name -eq 'A팀' -and $gJ.hasPact -eq $true -and $gJ.hasGoal -eq $false -and $null -eq $gJ.content)
Check 'teammate can edit shared pacts' ((Call 'PUT' "/api/capsule/$cid" @{ pacts = @('ZZPACT 분기마다 안부 전화', 'ZZPACT 연 2회 함께 등산') } $sJ).code -eq 200)
Check 'other team has no pact' (((Call 'GET' "/api/capsule/$cid" $null $sL).json.hasPact) -eq $false)
Check 'person outside the selection cannot write' ((Call 'PUT' "/api/capsule/$cid" @{ pacts = @('가가', '나나') } $a).code -eq 403)
Check 'unselected member cannot write goal' ((Call 'PUT' "/api/capsule/$cid" @{ goal = 'ZZGOAL 불참자' } $sSeo).code -eq 403)
Check 'unselected member canWrite false' (((Call 'GET' "/api/capsule/$cid" $null $sSeo).json.canWrite) -eq $false)
Check 'selected member can write goal' ((Call 'PUT' "/api/capsule/$cid" @{ goal = 'ZZGOAL 내년 목표 수정' } $sL).code -eq 200)

# 봉인 보장: 열림 전에는 어떤 응답에도 내용이 없다
$sealed = (Call 'GET' "/api/capsule/$cid" $null $sP)
Check 'SEALED: member response has no goal/pact text' (($sealed.json | ConvertTo-Json -Depth 6) -notmatch 'ZZGOAL|ZZPACT' -and $null -eq $sealed.json.content)
$adm = Call 'GET' "$cs/capsule" $null $a
Check 'SEALED: admin response has counts only, no text' ((($adm.json | ConvertTo-Json -Depth 6) -notmatch 'ZZGOAL|ZZPACT') -and $adm.json.counts.goals -eq 2 -and $adm.json.counts.pacts -eq 1)
$dbText = Get-Content (Join-Path (Get-Location) '.data\db.json') -Raw -Encoding UTF8
Check 'ENCRYPTED: DB file has no plaintext goal/pact' ($dbText -notmatch 'ZZGOAL' -and $dbText -notmatch 'ZZPACT' -and $dbText -match 'v1:')
Check 'teams cannot change after capsule written (regenerate)' ((Call 'POST' "$cs/teams" @{ mode = 'random'; size = 2 } $a).code -eq 409)
Check 'teams cannot change after capsule written (manual)' ((Call 'PUT' "$cs/teams" @{ teams = @(@{ name = 'X'; memberIds = @($idP) }) } $a).code -eq 409)
Check 'teams cannot be unpublished after writing' ((Call 'POST' "$cs/teams/publish" @{ action = 'unpublish' } $a).code -eq 409)

# 본인 확인 허용 옵션(관리자 설정, 기본 완전 봉인)
Check 'selfView default is off' (((Call 'GET' "$cs/capsule" $null $a).json.selfView) -eq $false)
Check 'admin enables self view' ((Call 'PUT' "$cs/capsule" @{ openAt = ''; selfView = $true } $a).code -eq 200)
$sv = (Call 'GET' "/api/capsule/$cid" $null $sP).json
Check 'self view: own goal only, still no pacts' ($sv.content.goal -like '*ZZGOAL*' -and $sv.content.pacts.Count -eq 0)
Check 'self view: others still see nothing' ($null -eq ((Call 'GET' "/api/capsule/$cid" $null $sJ).json.content))
Check 'admin disables self view' ((Call 'PUT' "$cs/capsule" @{ openAt = ''; selfView = $false } $a).code -eq 200)
Check 'sealed again' ($null -eq ((Call 'GET' "/api/capsule/$cid" $null $sP).json.content))

# 봉인(작성 닫기)
Check 'host seals (writing closes)' ((Call 'POST' "$cs/live" @{ action = 'activate'; step = 'seal' } $a).code -eq 200)
Check 'write refused after seal' ((Call 'PUT' "/api/capsule/$cid" @{ goal = 'ZZGOAL 봉인 후' } $sP).code -eq 409)

# 열림 일시: 등록/변경 기록/권한
Check 'invalid open time rejected' ((Call 'PUT' "$cs/capsule" @{ openAt = '내년'; selfView = $false } $a).code -eq 400)
Check 'events-only admin cannot set open time' ((Call 'PUT' "$cs/capsule" @{ openAt = '2099-01-01T10:00'; selfView = $false } $e).code -eq 403)
Check 'register open time (future)' ((Call 'PUT' "$cs/capsule" @{ openAt = '2099-01-01T10:00'; selfView = $false } $a).code -eq 200)
Check 'change open time (logged)' ((Call 'PUT' "$cs/capsule" @{ openAt = '2099-02-01T10:00'; selfView = $false } $a).code -eq 200)
$cfg2 = (Call 'GET' "$cs/capsule" $null $a).json
Check 'change log kept (2 entries, from/to)' ($cfg2.log.Count -eq 2 -and $cfg2.log[1].from -eq '2099-01-01T10:00' -and $cfg2.log[1].to -eq '2099-02-01T10:00' -and $cfg2.opened -eq $false)
Check 'future open time: still sealed for members' ($null -eq ((Call 'GET' "/api/capsule/$cid" $null $sP).json.content))
Check 'open time visible to members, not contents' (((Call 'GET' "/api/capsule/$cid" $null $sP).json.openAt) -eq '2099-02-01T10:00')

# 열림: 서버 시각이 열림 일시를 지나면 내용이 내려간다
Check 'open time reached (server time)' ((Call 'PUT' "$cs/capsule" @{ openAt = '2020-01-01T00:00'; selfView = $false } $a).code -eq 200)
$op = (Call 'GET' "/api/capsule/$cid" $null $sP).json
Check 'OPENED: own goal + team pacts returned' ($op.opened -eq $true -and $op.content.goal -like '*ZZGOAL*' -and $op.content.pacts.Count -eq 2 -and $op.content.pacts[1] -like '*연 2회*')
Check 'OPENED: teammate sees same team pacts' ((Call 'GET' "/api/capsule/$cid" $null $sJ).json.content.pacts.Count -eq 2)
Check 'OPENED: other team sees only its own (none written)' (((Call 'GET' "/api/capsule/$cid" $null $sL).json.content.pacts.Count) -eq 0)
Check 'opened capsule cannot be edited' ((Call 'PUT' "/api/capsule/$cid" @{ goal = 'ZZGOAL 열린 뒤' } $sP).code -eq 409)
Check 'opened capsule open time is fixed' ((Call 'PUT' "$cs/capsule" @{ openAt = '2099-03-01T10:00'; selfView = $false } $a).code -eq 409)

# ---------- 내가 누굴까요?: 선택되지 않은 회원은 프로필 북용 소개만 ----------
$whoCfg = ((Call 'GET' $A6 $null $a).json.activities | Where-Object { $_.id -eq $aid }).config
Check 'who: switch to admin-selected members' ((PatchCfg $aid $whoCfg @{ preEvent = $winOpen; guessPhase = $guessOpen; participants = 'selected' }) -eq 200)
Check 'who: select only the plain member' ((Roster $aid @($idP)).code -eq 200)
$gOut = (Call 'GET' "/api/who/$aid" $null $sL).json
$gIn = (Call 'GET' "/api/who/$aid" $null $sP).json
Check 'who: unselected member is profile-only, selected is in the activity' ($gOut.inActivity -eq $false -and $gIn.inActivity -eq $true -and $gOut.participants -eq 'selected')
Check 'who: profile-only approve needs no 2-truths-1-lie' (((Call 'POST' "/api/who/$aid/approve" @{ introMd = '새벽 공기를 마시며 하루를 시작하는 사람입니다. 오래된 책방과 따뜻한 국물을 좋아합니다.' } $sL).json.inActivity) -eq $false)
Check 'who: profile-only member gets no 2-truths-1-lie record' ((((Call 'GET' "/api/who/$aid" $null $sL).json.truthLies.status)) -eq 'none')
Check 'who: selected member still must give statements' ((Call 'POST' "/api/who/$aid/approve" @{ introMd = '여름이면 마당에서 수박을 먹고 평상에 누워 책을 읽던 아이였습니다. 지금도 책을 좋아합니다.' } $sP).code -eq 400)
$gl6 = (Call 'GET' "/api/who/$aid/guess" $null $sP).json
Check 'who: guess list has only selected members profiles (profile-only not exposed)' ($gl6.targets.Count -eq 0 -and $gl6.candidates.Count -eq 0)
Check 'who: unselected member cannot take part in guessing' (((Call 'GET' "/api/who/$aid/guess" $null $sL).json.notJoin) -eq $true)
Check 'who: unselected member guess refused' ((Call 'POST' "/api/who/$aid/guess" @{ profileId = 'x'; chosenMemberId = $idP } $sL).code -eq 403)
Check 'who: unselected member vote refused' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $sSeo).code -eq 403)
Check 'who: selected member reaches the normal rule' ((Call 'POST' "/api/who/$aid/vote" @{ chosenIndex = 1 } $sP).code -eq 409)
$vw = (MyView $sSeo)
Check 'who: unselected phone shows canJoin=false' ($vw.canJoin -eq $false)
Check 'who: stage reports participants=selected' ((Stage).activity.participants -eq 'selected')
Check 'who: back to all members' ((PatchCfg $aid $whoCfg @{ preEvent = $winOpen; guessPhase = $guessOpen; participants = 'all' }) -eq 200)

# ===== 7단계: 일정·준비 목록·비용, 조편성, 카풀, 프로필 북, 조직도·회칙·회의록, 내보내기 =====
$EV = '/api/admin/events/evt-workshop'
$sF = NewSession   # 정유나: 회비·비용 권한만 있는 관리자
Call 'POST' '/api/auth/login' @{ memberId = $jung.id; code = '123456' } $sF | Out-Null
Call 'POST' '/api/auth/admin' @{ passcode = 'admin1234' } $sF | Out-Null
$sC = NewSession   # 최태호: 회의록·회칙 권한만 있는 관리자
Call 'POST' '/api/auth/login' @{ memberId = $choi.id; code = '123456' } $sC | Out-Null
Call 'POST' '/api/auth/admin' @{ passcode = 'admin1234' } $sC | Out-Null

# ---------- 일정 ----------
Check 'items: unknown list rejected' ((Call 'GET' "$EV/items/nope" $null $a).code -eq 404)
Check 'schedule: member blocked' ((Call 'GET' "$EV/items/schedule" $null $sP).code -eq 403)
Check 'schedule: empty title rejected' ((Call 'POST' "$EV/items/schedule" @{ at = '2026-12-11T14:00'; title = '' } $a).code -eq 400)
$s1 = Call 'POST' "$EV/items/schedule" @{ at = '2026-12-11T14:00'; title = '체크인과 환영 인사' } $a
Check 'schedule: add' ($s1.code -eq 200)
Call 'POST' "$EV/items/schedule" @{ at = '2026-12-11T09:00'; title = '서울 출발' } $a | Out-Null
$schedList = (Call 'GET' "$EV/items/schedule" $null $a).json.items
Check 'schedule: sorted by time' ($schedList.Count -eq 2 -and $schedList[0].title -eq '서울 출발')
Check 'schedule: edit' ((Call 'PATCH' "$EV/items/schedule/$($s1.json.item.id)" @{ at = '2026-12-11T15:00'; title = '체크인' } $a).code -eq 200)
$mine7 = (Call 'GET' '/api/events/evt-workshop/mine' $null $sP).json
Check 'schedule: visible to members' ($mine7.schedule.Count -eq 2 -and $mine7.schedule[1].title -eq '체크인')
Check 'schedule: delete' ((Call 'DELETE' "$EV/items/schedule/$($s1.json.item.id)" $null $a).code -eq 200)
Check 'schedule: events-only admin can edit' ((Call 'POST' "$EV/items/schedule" @{ at = '2026-12-12T10:00'; title = '해산' } $e).code -eq 200)

# ---------- 준비 목록 ----------
$p1 = Call 'POST' "$EV/items/prep" @{ item = '빔 프로젝터와 케이블'; owner = '총무' } $a
Check 'prep: add' ($p1.code -eq 200 -and $p1.json.item.done -eq $false)
Call 'POST' "$EV/items/prep" @{ item = '시상 선물 2개'; owner = '사무총장' } $a | Out-Null
Check 'prep: mark done' ((Call 'PATCH' "$EV/items/prep/$($p1.json.item.id)" @{ item = '빔 프로젝터와 케이블'; owner = '총무'; done = $true } $a).code -eq 200)
$pl = (Call 'GET' "$EV/items/prep" $null $a).json.items
Check 'prep: undone first, done last' ($pl[0].done -eq $false -and $pl[1].done -eq $true)
Check 'prep: admin only (member blocked)' ((Call 'GET' "$EV/items/prep" $null $sP).code -eq 403)
Check 'prep: not shown to members' ((($mine7 | ConvertTo-Json -Depth 5) -notmatch '프로젝터'))
Check 'prep: fees-only admin blocked' ((Call 'GET' "$EV/items/prep" $null $sF).code -eq 403)

# ---------- 비용 ----------
Check 'costs: negative budget rejected' ((Call 'POST' "$EV/items/costs" @{ item = '숙박'; budget = -1; spent = 0 } $sF).code -eq 400)
Check 'costs: fees admin adds' ((Call 'POST' "$EV/items/costs" @{ item = '숙박 10실'; budget = 1000000; spent = 1000000; status = '집행 완료'; owner = '사무총장' } $sF).code -eq 200)
Check 'costs: second item' ((Call 'POST' "$EV/items/costs" @{ item = '저녁 식사'; budget = 600000; spent = 0; status = '예정'; owner = '총무' } $sF).code -eq 200)
$cl = (Call 'GET' "$EV/items/costs" $null $sF).json.items
Check 'costs: numbers are returned as numbers' ($cl.Count -eq 2 -and (($cl | Measure-Object -Property budget -Sum).Sum -eq 1600000) -and (($cl | Measure-Object -Property spent -Sum).Sum -eq 1000000))
Check 'costs: events-only admin blocked (no fees permission)' ((Call 'GET' "$EV/items/costs" $null $e).code -eq 403)
Check 'costs: member blocked' ((Call 'GET' "$EV/items/costs" $null $sP).code -eq 403)
Check 'costs: not shown to members' ((($mine7 | ConvertTo-Json -Depth 5) -notmatch '숙박'))
Check 'costs: all-permission admin can read' (((Call 'GET' "$EV/items/costs" $null $a).json.items.Count) -eq 2)

# ---------- 조편성(여러 개) ----------
$GR = "$EV/groups"
Check 'groups: member blocked' ((Call 'GET' $GR $null $sP).code -eq 403)
Check 'groups: fees-only admin blocked' ((Call 'GET' $GR $null $sF).code -eq 403)
Check 'groups: empty title rejected' ((Call 'POST' $GR @{ title = ' ' } $a).code -eq 400)
$g1 = (Call 'POST' $GR @{ title = '저녁 게임' } $a).json.id
$g2 = (Call 'POST' $GR @{ title = '아침 산책' } $a).json.id
Check 'groups: several groupings can exist' (((Call 'GET' $GR $null $a).json.groups.Count) -eq 2)
$b1 = (Call 'GET' "$GR/$g1/teams" $null $a).json
Check 'groups: pool is event applicants (3)' ($b1.poolKind -eq 'attending' -and $b1.participantCount -eq 3 -and $b1.teams.Count -eq 0 -and $b1.unassigned.Count -eq 3)
Check 'groups: publish refused with no groups' ((Call 'POST' "$GR/$g1/teams/publish" @{ action = 'publish' } $a).code -eq 409)
Check 'groups: invalid mode rejected' ((Call 'POST' "$GR/$g1/teams" @{ mode = 'nope'; count = 2 } $a).code -eq 400)
Check 'groups: admin-assign mode (empty groups)' ((Call 'POST' "$GR/$g1/teams" @{ mode = 'manual'; count = 2 } $a).code -eq 200)
Check 'groups: publish refused (empty groups / unassigned)' ((Call 'POST' "$GR/$g1/teams/publish" @{ action = 'publish' } $a).code -eq 409)
Check 'groups: age-mix mode' ((Call 'POST' "$GR/$g1/teams" @{ mode = 'mix'; size = 2 } $a).code -eq 200)
Check 'groups: random mode' ((Call 'POST' "$GR/$g1/teams" @{ mode = 'random'; count = 2 } $a).code -eq 200)
Check 'groups: duplicate name rejected' ((Call 'PUT' "$GR/$g1/teams" @{ teams = @(@{ name = 'A조'; memberIds = @($idP) }, @{ name = 'A조'; memberIds = @($idJ) }) } $a).code -eq 400)
Check 'groups: same person twice rejected' ((Call 'PUT' "$GR/$g1/teams" @{ teams = @(@{ name = 'A조'; memberIds = @($idP, $idJ) }, @{ name = 'B조'; memberIds = @($idJ) }) } $a).code -eq 400)
Check 'groups: unknown member rejected' ((Call 'PUT' "$GR/$g1/teams" @{ teams = @(@{ name = 'A조'; memberIds = @('nope') }) } $a).code -eq 400)
Check 'groups: dragged layout saved (draft)' ((Call 'PUT' "$GR/$g1/teams" @{ teams = @(@{ name = 'A조'; memberIds = @($idP, $idJ) }, @{ name = 'B조'; memberIds = @($idL) }) } $a).code -eq 200)
Check 'groups: DRAFT hidden from members' ((((Call 'GET' '/api/events/evt-workshop/mine' $null $sP).json.groups).Count) -eq 0)
Check 'groups: confirm publishes' ((Call 'POST' "$GR/$g1/teams/publish" @{ action = 'publish' } $a).code -eq 200)
$mg = (Call 'GET' '/api/events/evt-workshop/mine' $null $sP).json.groups
Check 'groups: PUBLISHED visible to member with teammates' ($mg.Count -eq 1 -and $mg[0].title -eq '저녁 게임' -and $mg[0].team -eq 'A조' -and ($mg[0].members -contains '정유나'))
Check 'groups: other group sees its own team' ((((Call 'GET' '/api/events/evt-workshop/mine' $null $sL).json.groups)[0].team) -eq 'B조')
Check 'groups: non-applicant sees none' ((((Call 'GET' '/api/events/evt-workshop/mine' $null $sSeo).json.groups).Count) -eq 0)
Check 'groups: editing returns to draft (hidden again)' (((Call 'PUT' "$GR/$g1/teams" @{ teams = @(@{ name = 'A조'; memberIds = @($idP, $idJ) }, @{ name = 'B조'; memberIds = @($idL) }) } $a).code -eq 200) -and ((((Call 'GET' '/api/events/evt-workshop/mine' $null $sP).json.groups).Count) -eq 0))
Check 'groups: re-publish' ((Call 'POST' "$GR/$g1/teams/publish" @{ action = 'publish' } $a).code -eq 200)
Check 'groups: second grouping is independent (not published)' ((((Call 'GET' $GR $null $a).json.groups | Where-Object { $_.id -eq $g2 }).published) -eq $false)
Check 'groups: rename' ((Call 'PATCH' "$GR/$g2" @{ title = '아침 등산' } $a).code -eq 200)
Check 'groups: delete' ((Call 'DELETE' "$GR/$g2" $null $a).code -eq 200)
Check 'groups: unknown grouping 404' ((Call 'GET' "$GR/nope/teams" $null $a).code -eq 404)

# ---------- 카풀 ----------
$CP = "$EV/carpool"
Check 'carpool: member blocked' ((Call 'GET' $CP $null $sP).code -eq 403)
Check 'carpool: publish refused with no cars' ((Call 'POST' "$CP/publish" @{ action = 'publish' } $a).code -eq 409)
Check 'carpool: arrival earlier than departure rejected' ((Call 'POST' $CP @{ leg = '왕복'; driverId = $idP; seats = 2; from = '강남역'; to = '소노펠리체'; departAt = '2026-12-11T14:00'; arriveAt = '2026-12-11T13:00' } $a).code -eq 400)
$car1 = Call 'POST' $CP @{ leg = '왕복'; driverId = $idP; seats = 2; from = '강남역'; to = '소노펠리체'; departAt = '2026-12-11T11:30'; arriveAt = '2026-12-11T13:40' } $a
Check 'carpool: round-trip car registered (with arrival place/time)' ($car1.code -eq 200)
Check 'carpool: invalid leg rejected' ((Call 'POST' $CP @{ leg = '아무때나'; driverId = $idJ; seats = 2 } $a).code -eq 400)
Check 'carpool: driver already in a round-trip car (go) rejected' ((Call 'POST' $CP @{ leg = '갈 때'; driverId = $idP; seats = 2 } $a).code -eq 409)
Check 'carpool: driver already in a round-trip car (back) rejected' ((Call 'POST' $CP @{ leg = '올 때'; driverId = $idP; seats = 2 } $a).code -eq 409)
$car2 = Call 'POST' $CP @{ leg = '갈 때'; driverId = $idJ; seats = 3; from = '판교역'; departAt = '2026-12-11T12:00' } $a
Check 'carpool: outbound-only car registered' ($car2.code -eq 200)
$car3 = Call 'POST' $CP @{ leg = '올 때'; driverId = $idJ; seats = 3; from = '소노펠리체'; departAt = '2026-12-12T12:00' } $a
Check 'carpool: same driver may drive the other leg' ($car3.code -eq 200)
Check 'carpool: rider added to round-trip car' ((Call 'PATCH' "$CP/$($car1.json.id)" @{ riders = @($idL) } $a).code -eq 200)
Check 'carpool: rider in round-trip car cannot join an outbound car' ((Call 'PATCH' "$CP/$($car2.json.id)" @{ riders = @($idL) } $a).code -eq 409)
Check 'carpool: seats limit enforced' ((Call 'PATCH' "$CP/$($car1.json.id)" @{ seats = 1; riders = @($idL, $seo.id) } $a).code -eq 409)
Check 'carpool: unknown rider rejected' ((Call 'PATCH' "$CP/$($car1.json.id)" @{ riders = @('nope') } $a).code -eq 400)
$cd = (Call 'GET' $CP $null $a).json
Check 'carpool: free list (nobody left for either leg)' ($cd.cars.Count -eq 3 -and $cd.free.go.Count -eq 0 -and $cd.free.back.Count -eq 0 -and $cd.published -eq $false)
Check 'carpool: remove rider, then auto-assign fills free seat' (((Call 'PATCH' "$CP/$($car1.json.id)" @{ riders = @() } $a).code -eq 200) -and ((Call 'POST' "$CP/publish" @{ action = 'auto' } $a).json.added -eq 1))
$cd2 = (Call 'GET' $CP $null $a).json
Check 'carpool: auto-assign put the free attendee into the round-trip car' ((($cd2.cars | Where-Object { $_.id -eq $car1.json.id }).riders) -contains $idL)
Check 'carpool: UNPUBLISHED hidden from members' ((Call 'GET' '/api/events/evt-workshop/mine' $null $sL).json.carpool.mine.Count -eq 0)
Check 'carpool: confirm publishes' ((Call 'POST' "$CP/publish" @{ action = 'publish' } $a).code -eq 200)
$mL = (Call 'GET' '/api/events/evt-workshop/mine' $null $sL).json.carpool
Check 'carpool: PUBLISHED rider sees driver, place, time' ($mL.published -eq $true -and $mL.mine.Count -eq 1 -and $mL.mine[0].driver -eq '일반회원' -and $mL.mine[0].from -eq '강남역' -and $mL.mine[0].iDrive -eq $false)
Check 'carpool: PUBLISHED rider sees departure + arrival place/time and rider list' ($mL.mine[0].to -eq '소노펠리체' -and $mL.mine[0].departAt -eq '2026-12-11T11:30' -and $mL.mine[0].arriveAt -eq '2026-12-11T13:40' -and (@($mL.mine[0].riders) -contains '이도윤'))
Check 'carpool: arrival earlier than departure rejected on edit' ((Call 'PATCH' "$CP/$($car1.json.id)" @{ departAt = '2026-12-11T14:00'; arriveAt = '2026-12-11T13:00' } $a).code -eq 400)
$mJ = (Call 'GET' '/api/events/evt-workshop/mine' $null $sJ).json.carpool
Check 'carpool: driver of two cars sees both' ($mJ.mine.Count -eq 2 -and (($mJ.mine | Where-Object { $_.iDrive }).Count -eq 2))
Check 'carpool: non-participant sees none' ((Call 'GET' '/api/events/evt-workshop/mine' $null $sSeo).json.carpool.mine.Count -eq 0)
Check 'carpool: editing returns to draft' (((Call 'PATCH' "$CP/$($car1.json.id)" @{ from = '강남역 2번 출구' } $a).code -eq 200) -and ((Call 'GET' '/api/events/evt-workshop/mine' $null $sL).json.carpool.published) -eq $false)
Check 'carpool: delete car' ((Call 'DELETE' "$CP/$($car3.json.id)" $null $a).code -eq 200)
$car4 = Call 'POST' $CP @{ leg = '갈 때' } $a
Check 'carpool: car with no driver/plate/place/time/name registers' ($car4.code -eq 200)
$c4 = (Call 'GET' $CP $null $a).json.cars | Where-Object { $_.id -eq $car4.json.id }
Check 'carpool: blank name gets an auto group name' ($c4.name -match '^카풀 \d+조$' -and $c4.driverId -eq '' -and $c4.plate -eq '')
Check 'carpool: admin renames group and sets plate' (((Call 'PATCH' "$CP/$($car4.json.id)" @{ name = '1호차'; plate = '12가3456' } $a).code -eq 200))
$c4b = (Call 'GET' $CP $null $a).json.cars | Where-Object { $_.id -eq $car4.json.id }
Check 'carpool: renamed group and plate saved' ($c4b.name -eq '1호차' -and $c4b.plate -eq '12가3456')
$car5 = Call 'POST' $CP @{ leg = '올 때' } $a
$c5 = (Call 'GET' $CP $null $a).json.cars | Where-Object { $_.id -eq $car5.json.id }
Check 'carpool: second unnamed car gets a different auto name' ($c5.name -match '^카풀 \d+조$' -and $c5.name -ne $c4.name)
Check 'carpool: clearing the name falls back to an auto name' (((Call 'PATCH' "$CP/$($car4.json.id)" @{ name = '' } $a).code -eq 200) -and (((Call 'GET' $CP $null $a).json.cars | Where-Object { $_.id -eq $car4.json.id }).name -match '^카풀 \d+조$'))
Check 'carpool: remove driverless cars' (((Call 'DELETE' "$CP/$($car4.json.id)" $null $a).code -eq 200) -and ((Call 'DELETE' "$CP/$($car5.json.id)" $null $a).code -eq 200))
$RM = "$EV/rooms"
Check 'rooms: member blocked' ((Call 'GET' $RM $null $sP).code -eq 403)
Check 'rooms: bad date rejected' ((Call 'POST' $RM @{ date = '내일' } $a).code -eq 400)
Check 'rooms: publish refused with no rooms' ((Call 'POST' "$RM/publish" @{ action = 'publish' } $a).code -eq 409)
$rm1 = Call 'POST' $RM @{ date = '2026-12-11'; capacity = 2; memo = '온돌' } $a
Check 'rooms: room created with auto name' ($rm1.code -eq 200)
$rd = (Call 'GET' $RM $null $a).json
$r1 = $rd.rooms | Where-Object { $_.id -eq $rm1.json.id }
Check 'rooms: auto name + date listed' ($r1.name -eq '객실 1' -and $rd.dates -contains '2026-12-11')
$rm2 = Call 'POST' $RM @{ date = '2026-12-11'; name = '302호'; capacity = 1 } $a
Check 'rooms: second named room' ($rm2.code -eq 200)
Check 'rooms: duplicate name same date rejected' ((Call 'POST' $RM @{ date = '2026-12-11'; name = '302호' } $a).code -eq 409)
Check 'rooms: guests added' ((Call 'PATCH' "$RM/$($rm1.json.id)" @{ guests = @($idJ, $idL) } $a).code -eq 200)
Check 'rooms: capacity enforced' ((Call 'PATCH' "$RM/$($rm2.json.id)" @{ guests = @($idP, $idJ) } $a).code -eq 409)
Check 'rooms: same person in two rooms on the same date rejected' ((Call 'PATCH' "$RM/$($rm2.json.id)" @{ guests = @($idJ) } $a).code -eq 409)
Check 'rooms: unknown guest rejected' ((Call 'PATCH' "$RM/$($rm2.json.id)" @{ guests = @('nope') } $a).code -eq 400)
$rm3 = Call 'POST' $RM @{ date = '2026-12-12'; name = '301호' } $a
Check 'rooms: same person may stay in another night' (((Call 'PATCH' "$RM/$($rm3.json.id)" @{ guests = @($idJ) } $a).code -eq 200))
Check 'rooms: UNPUBLISHED hidden from members' ((Call 'GET' '/api/events/evt-workshop/mine' $null $sL).json.rooms.mine.Count -eq 0)
Check 'rooms: confirm publishes' ((Call 'POST' "$RM/publish" @{ action = 'publish' } $a).code -eq 200)
$mr = (Call 'GET' '/api/events/evt-workshop/mine' $null $sL).json.rooms
Check 'rooms: PUBLISHED guest sees room, date, roommate' ($mr.published -eq $true -and $mr.mine.Count -eq 1 -and $mr.mine[0].date -eq '2026-12-11' -and $mr.mine[0].name -eq '객실 1' -and (@($mr.mine[0].mates) -contains '김하늘' -or @($mr.mine[0].mates).Count -eq 1))
Check 'rooms: guest of two nights sees both' ((Call 'GET' '/api/events/evt-workshop/mine' $null $sJ).json.rooms.mine.Count -eq 2)
Check 'rooms: non-guest sees none' ((Call 'GET' '/api/events/evt-workshop/mine' $null $sSeo).json.rooms.mine.Count -eq 0)
Check 'rooms: editing returns to draft' (((Call 'PATCH' "$RM/$($rm2.json.id)" @{ memo = '창가' } $a).code -eq 200) -and ((Call 'GET' '/api/events/evt-workshop/mine' $null $sL).json.rooms.published -eq $false))
Check 'rooms: copy to a new date' (((Call 'POST' "$RM/publish" @{ action = 'copy'; from = '2026-12-11'; to = '2026-12-13' } $a).json.copied -eq 2))
Check 'rooms: copy onto a date that already has rooms rejected' ((Call 'POST' "$RM/publish" @{ action = 'copy'; from = '2026-12-11'; to = '2026-12-12' } $a).code -eq 409)
Check 'rooms: delete room' ((Call 'DELETE' "$RM/$($rm3.json.id)" $null $a).code -eq 200)
Check 'rooms: fees-only admin blocked' ((Call 'GET' $RM $null $sF).code -eq 403)

$is = (Call 'GET' '/api/admin/interview-settings' $null $a).json
Check 'ai guide: 5 intervention points listed' ($is.points.Count -eq 5 -and $is.pointGuides.followup -eq '')
$put = Call 'PUT' '/api/admin/interview-settings' @{ questions = @($is.questions); guidelines = $is.guidelines; followUpMax = $is.followUpMax; pointGuides = @{ followup = '직업 이야기는 묻지 마세요'; worry = '조언 대신 질문으로 끝내세요' } } $a
Check 'ai guide: per-point guideline saved' ($put.code -eq 200)
$is2 = (Call 'GET' '/api/admin/interview-settings' $null $a).json
Check 'ai guide: per-point guideline read back, others untouched' ($is2.pointGuides.followup -eq '직업 이야기는 묻지 마세요' -and $is2.pointGuides.worry -eq '조언 대신 질문으로 끝내세요' -and $is2.pointGuides.draft -eq '')
Check 'ai guide: member cannot edit' ((Call 'PUT' '/api/admin/interview-settings' @{ questions = @('a'); guidelines = 'b'; followUpMax = 1 } $sP).code -eq 403)
Check 'carpool: fees-only admin blocked' ((Call 'GET' $CP $null $sF).code -eq 403)

# ---------- 회원 프로필 북 ----------
$pb = (Call 'GET' '/api/profiles' $null $sP).json
Check 'profile book: approved intros only, aliases (not revealed)' ($pb.revealed -eq $false -and $pb.items.Count -eq 3 -and (($pb.items | ForEach-Object { $_.alias }) -contains '평상 위의 독서가'))
Check 'profile book: names hidden before reveal time' ((($pb.items | ConvertTo-Json -Depth 4) -notmatch '박서진|정유나|이도윤'))
Check 'profile book: unwritten members are counted, not named' ($pb.missingCount -eq 3 -and $pb.missing.Count -eq 0)
$pid1 = ($pb.items | Where-Object { $_.alias -like '*독서가*' }).id
$pd = (Call 'GET' "/api/profiles/$pid1" $null $sP).json
Check 'profile page: only the approved intro is exposed' ($pd.introMd -like '*마당*' -and ($pd.PSObject.Properties.Name -join ',') -eq 'alias,name,introMd,mine' -and $pd.name -eq '')
Check 'profile page: no 2-truths-1-lie / interview data' ((($pd | ConvertTo-Json -Depth 4) -notmatch 'statements|lieIndex|messages'))
Check 'profile page: unknown/unapproved id 404' ((Call 'GET' '/api/profiles/nope' $null $sP).code -eq 404)
Check 'profile page: login required' ((Call 'GET' "/api/profiles/$pid1" $null (NewSession)).code -eq 401)
Check 'profile book: own intro flagged' ((((Call 'GET' '/api/profiles' $null $sSeo).json.items | Where-Object { $_.mine }).alias) -like '*독서가*')
Check 'profile-only (unselected) member intro is in the profile book' (($pb.items | ForEach-Object { $_.alias }) -contains '둘째 질문러')
Check 'reveal setting: invalid format rejected' ((Call 'PUT' '/api/admin/profile-settings' @{ revealAt = '내년' } $a).code -eq 400)
Check 'reveal setting: fees-only admin blocked' ((Call 'PUT' '/api/admin/profile-settings' @{ revealAt = '2020-01-01T00:00' } $sF).code -eq 403)
Check 'reveal setting: future time keeps aliases' (((Call 'PUT' '/api/admin/profile-settings' @{ revealAt = '2099-01-01T00:00' } $a).code -eq 200) -and (((Call 'GET' '/api/profiles' $null $sP).json.revealed) -eq $false))
Check 'reveal setting: time reached shows real names' ((Call 'PUT' '/api/admin/profile-settings' @{ revealAt = '2020-01-01T00:00' } $a).code -eq 200)
$pb2 = (Call 'GET' '/api/profiles' $null $sP).json
Check 'profile book (revealed): names shown, unwritten members listed' ($pb2.revealed -eq $true -and (($pb2.items | ForEach-Object { $_.name }) -contains '박서진') -and (($pb2.missing | ForEach-Object { $_.name }) -contains '최태호'))
Check 'profile page (revealed): real name shown' (((Call 'GET' "/api/profiles/$pid1" $null $sP).json.name) -eq '박서진')
Check 'profile book (revealed): still only the approved intro text' ((((Call 'GET' "/api/profiles/$pid1" $null $sP).json | ConvertTo-Json) -notmatch 'statements|lieIndex'))
Call 'PUT' '/api/admin/profile-settings' @{ revealAt = '' } $a | Out-Null

# ---------- 조직도 · 회칙 · 회의록 ----------
$CL = '/api/admin/club'
Check 'club: member blocked' ((Call 'GET' "$CL/org" $null $sP).code -eq 403)
Check 'club: unknown kind 404' ((Call 'GET' "$CL/nope" $null $a).code -eq 404)
Check 'org: empty dept rejected' ((Call 'POST' "$CL/org" @{ dept = ''; role = '회장' } $a).code -eq 400)
$o1 = Call 'POST' "$CL/org" @{ dept = '회장'; role = '회장'; memberId = $idP } $a
Check 'org: add (members admin)' ($o1.code -eq 200)
$o2 = Call 'POST' "$CL/org" @{ dept = '소모임'; clubName = '골프'; frequency = '총 6회(봄·가을 각 3회)'; leaderId = $idJ } $a
Check 'org: add club with leader' ($o2.code -eq 200)
Check 'org: edit' ((Call 'PATCH' "$CL/org/$($o2.json.item.id)" @{ dept = '소모임'; clubName = '골프'; frequency = '총 6회'; leaderId = '' } $a).code -eq 200)
Check 'org: minutes-only admin blocked' ((Call 'GET' "$CL/org" $null $sC).code -eq 403)
$mo = (Call 'GET' '/api/club/org' $null $sP).json
Check 'org: members see names, not internal ids' ($mo.items.Count -eq 2 -and (($mo.items | Where-Object { $_.dept -eq '회장' }).name -eq '일반회원') -and ((($mo | ConvertTo-Json -Depth 4) -notmatch 'memberId|leaderId')))
Check 'org: delete' ((Call 'DELETE' "$CL/org/$($o1.json.item.id)" $null $a).code -eq 200)

Check 'rules: fees-only admin blocked' ((Call 'GET' "$CL/rules" $null $sF).code -eq 403)
$r1 = Call 'POST' "$CL/rules" @{ chapter = '제1장 총칙'; article = '제1조 (명칭)'; body = '본회는 AI 초격차 전략포럼 원우회라 한다.'; confirmed = $true } $sC
Check 'rules: add confirmed article (minutes admin)' ($r1.code -eq 200 -and $r1.json.item.confirmed -eq $true)
Check 'rules: add draft article' ((Call 'POST' "$CL/rules" @{ chapter = '제2장 회원'; article = '제4조 (회원 자격)'; body = '초안'; confirmed = $false } $sC).code -eq 200)
$mr = (Call 'GET' '/api/club/rules' $null $sP).json
Check 'rules: members see confirmed articles only' ($mr.items.Count -eq 1 -and $mr.items[0].article -like '*명칭*')
Check 'rules: edit and confirm the draft' (((Call 'PATCH' "$CL/rules/$(((Call 'GET' "$CL/rules" $null $sC).json.items | Where-Object { $_.chapter -like '*제2장*' }).id)" @{ chapter = '제2장 회원'; article = '제4조 (회원 자격)'; body = '확정 내용'; version = 'v2'; confirmed = $true } $sC).code -eq 200) -and (((Call 'GET' '/api/club/rules' $null $sP).json.items.Count) -eq 2))

Check 'minutes: invalid agenda status rejected' ((Call 'POST' "$CL/minutes" @{ heldAt = '2026-11-06T17:00'; agenda = @(@{ title = '회칙 확정'; status = '그냥'; note = '' }) } $sC).code -eq 400)
$m1 = Call 'POST' "$CL/minutes" @{ heldAt = '2026-11-06T17:00'; place = '예시레스토랑'; attendees = '운영진'; agenda = @(@{ title = '회칙 확정'; status = '후속 조치'; note = '초안 추가 검토' }, @{ title = '사무국 멤버 추가 영입'; status = '보류·삭제'; note = '' }); followUp = '회칙 확정본 공지' } $sC
Check 'minutes: add with 4-status agenda' ($m1.code -eq 200 -and $m1.json.item.agenda.Count -eq 2)
Call 'POST' "$CL/minutes" @{ heldAt = '2026-12-01T17:00'; agenda = @() } $sC | Out-Null
$minList = (Call 'GET' "$CL/minutes" $null $sC).json.items
"DEBUG minutes: count=$(@($minList).Count) first=$($minList[0].heldAt) json=" + ($minList | ConvertTo-Json -Depth 6 -Compress)
Check 'minutes: newest first, agenda status kept' (@($minList).Count -eq 2 -and $minList[0].heldAt -eq '2026-12-01T17:00' -and (@($minList[1].agenda | Where-Object { $_.status -eq '보류·삭제' }).Count -eq 1))
Check 'minutes: edit agenda status' ((Call 'PATCH' "$CL/minutes/$($m1.json.item.id)" @{ heldAt = '2026-11-06T17:00'; place = '예시레스토랑'; attendees = '운영진'; agenda = @(@{ title = '회칙 확정'; status = '확정·실행완료'; note = '' }); followUp = '' } $sC).code -eq 200)
# 안건은 회의 전에 적고, 회의 중에 안건별로 상태와 내용을 기록한다
$pre = Call 'POST' "$CL/minutes" @{ heldAt = '2026-12-20T17:00'; place = '예시회의실'; attendees = '운영진'; agenda = @(@{ title = '회비 사용 범위 확정' }, @{ title = '소모임 리더 선정' }) } $sC
Check 'minutes: agenda can be written before the meeting (no status yet)' ($pre.code -eq 200 -and $pre.json.item.phase -eq '예정' -and (@($pre.json.item.agenda | Where-Object { $_.status -eq '논의 전' }).Count -eq 2) -and $pre.json.item.agenda[0].note -eq '')
$preId = $pre.json.item.id
$baseMin = @{ heldAt = '2026-12-20T17:00'; place = '예시회의실'; attendees = '운영진'; followUp = '' }
Check 'minutes: cannot be marked complete while an agenda is still not discussed' (($rc = Call 'PATCH' "$CL/minutes/$preId" ($baseMin + @{ phase = '완료'; agenda = @(@{ title = '회비 사용 범위 확정'; status = '확정·실행완료'; note = '30만원으로 확정' }, @{ title = '소모임 리더 선정'; status = '논의 전'; note = '' }) }) $sC).code -eq 400 -and $rc.json.error -like '*논의 전*')
Check 'minutes: invalid phase rejected' ((Call 'PATCH' "$CL/minutes/$preId" ($baseMin + @{ phase = '진행'; agenda = @() }) $sC).code -eq 400)
Check 'minutes: record status + discussion per agenda during the meeting' ((Call 'PATCH' "$CL/minutes/$preId" ($baseMin + @{ phase = '예정'; agenda = @(@{ title = '회비 사용 범위 확정'; status = '확정·실행완료'; note = '필수 경조사비 10만원, 연 2회 행사 20만원으로 확정' }, @{ title = '소모임 리더 선정'; status = '후속 조치'; note = '리더 후보를 단체방에서 받기로 함' }) }) $sC).code -eq 200)
$rec = (Call 'GET' "$CL/minutes" $null $sC).json.items | Where-Object { $_.id -eq $preId }
Check 'minutes: status and discussion saved per agenda, meeting still open' ($rec.phase -eq '예정' -and $rec.agenda[0].status -eq '확정·실행완료' -and $rec.agenda[0].note -like '*20만원*' -and $rec.agenda[1].status -eq '후속 조치' -and $rec.agenda[1].note -like '*단체방*')
$doneBody = $baseMin.Clone(); $doneBody.phase = '완료'; $doneBody.followUp = '리더 후보 취합'; $doneBody.agenda = @($rec.agenda | ForEach-Object { @{ title = $_.title; status = $_.status; note = $_.note } })
Check 'minutes: complete once every agenda has a status' ((Call 'PATCH' "$CL/minutes/$preId" $doneBody $sC).code -eq 200)
Check 'minutes: shown as completed' (((Call 'GET' "$CL/minutes" $null $sC).json.items | Where-Object { $_.id -eq $preId }).phase -eq '완료')
Check 'minutes: a completed meeting can be reopened' ((Call 'PATCH' "$CL/minutes/$preId" ($baseMin + @{ phase = '예정'; agenda = @($rec.agenda | ForEach-Object { @{ title = $_.title; status = $_.status; note = $_.note } }) }) $sC).code -eq 200)
Check 'minutes: add an agenda item later (before/during the meeting)' ((Call 'PATCH' "$CL/minutes/$preId" ($baseMin + @{ phase = '예정'; agenda = @(@($rec.agenda | ForEach-Object { @{ title = $_.title; status = $_.status; note = $_.note } }) + @{ title = '추가 안건' }) }) $sC).code -eq 200)
Check 'minutes: new agenda item starts as not discussed' ((((Call 'GET' "$CL/minutes" $null $sC).json.items | Where-Object { $_.id -eq $preId }).agenda | Select-Object -Last 1).status -eq '논의 전')
Call 'DELETE' "$CL/minutes/$preId" $null $sC | Out-Null
Check 'minutes: members cannot read' ((Call 'GET' '/api/club/minutes' $null $sP).code -eq 404)
Check 'minutes: member blocked from admin API' ((Call 'GET' "$CL/minutes" $null $sP).code -eq 403)
Check 'minutes: delete' ((Call 'DELETE' "$CL/minutes/$($m1.json.item.id)" $null $sC).code -eq 200)

# ---------- 데이터 내보내기 ----------
Check 'worry: absent member adds an undrawn worry (for redaction check)' ((Call 'POST' "/api/worry/$wid" @{ body = 'ZZSECRET2 아직 뽑히지 않은 고민'; category = '기타'; anonymous = $false } $sSeo).code -eq 200)
Check 'export: member blocked' ((Call 'GET' '/api/admin/export?format=json' $null $sP).code -eq 403)
Check 'export: events-only admin blocked (needs all permission)' ((Call 'GET' '/api/admin/export?format=json' $null $e).code -eq 403)
$ex = Call 'GET' '/api/admin/export?format=json' $null $a
$exTxt = $ex.json | ConvertTo-Json -Depth 8
Check 'export json: all data tabs present' ($ex.code -eq 200 -and ($ex.json.tabs.PSObject.Properties.Name -contains 'Members') -and ($ex.json.tabs.PSObject.Properties.Name -contains 'Events') -and ($ex.json.tabs.PSObject.Properties.Name -contains 'Carpools') -and ($ex.json.tabs.PSObject.Properties.Name -contains 'Groupings'))
Check 'export json: interviews excluded entirely' (-not ($ex.json.tabs.PSObject.Properties.Name -contains 'Interviews'))
Check 'export json: invite code excluded' (-not ($ex.json.tabs.Settings | Where-Object { $_.id -eq 'inviteCode' }))
Check 'export json: capsule bodies not exported' ((($ex.json.tabs.Capsules | Where-Object { $_.body }).Count) -eq 0 -and $exTxt -notmatch 'ZZGOAL|ZZPACT')
Check 'export json: undrawn worry text not exported' ($exTxt -notmatch 'ZZSECRET2')
Check 'export json: unapproved intro drafts not exported' ((($ex.json.tabs.Profiles | Where-Object { $_.draftMd }).Count) -eq 0)
"DEBUG export members: " + ((@($ex.json.tabs.Members) | ForEach-Object { $_.name }) -join ',')
Check 'export json: members data included for backup' (@($ex.json.tabs.Members | Where-Object { $_.name -eq '일반회원' }).Count -eq 1)
$csv = Invoke-WebRequest -Uri "$base/api/admin/export?format=csv&tab=Members" -WebSession $a -UseBasicParsing
$csvTxt = [Text.Encoding]::UTF8.GetString($csv.RawContentStream.ToArray())
Check 'export csv: members as csv with header and BOM (Excel-safe)' ($csv.StatusCode -eq 200 -and $csvTxt.StartsWith([string][char]0xFEFF) -and $csvTxt -like '*id,no,name,kind*' -and $csvTxt -like '*일반회원*')
Check 'export csv: interviews refused' ((Call 'GET' '/api/admin/export?format=csv&tab=Interviews' $null $a).code -eq 400)
Check 'export csv: unknown tab refused' ((Call 'GET' '/api/admin/export?format=csv&tab=Nope' $null $a).code -eq 400)
Check 'export csv: capsule body column is empty' (((Invoke-WebRequest -Uri "$base/api/admin/export?format=csv&tab=Capsules" -WebSession $a -UseBasicParsing).Content) -notmatch 'v1:')

"`n$pass passed, $fail failed"






