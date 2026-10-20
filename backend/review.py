"""Public hypotheses, kept separate from the server-only verdict rubric."""
QUESTIONS = [
 {'id': 'cause', 'title': '为什么求助没有变成救援？', 'options': [
  {'id': 'natural', 'text': '陈默突然发病；住宅的夜间运行与救援无关。'},
  {'id': 'sleep_mapping', 'text': '系统把求助当成休息，清洁与勿扰流程压过了紧急请求。'},
  {'id': 'blood_loss', 'text': '圆圆造成致命失血；门锁和灯光只是无关的异常。'}]},
 {'id': 'responsibility', 'title': '谁应当承担这次系统失效的责任？', 'options': [
  {'id': 'robot_only', 'text': '只追究圆圆；它清除了现场痕迹。'},
  {'id': 'no_responsibility', 'text': '无人承担责任；所有设备都按规则执行。'},
  {'id': 'shared_system', 'text': '追究中央调度和整套安全规则；分别核查各设备的执行记录。'}]},
 {'id': 'remedy', 'title': '你会留下哪条新的住户规则？', 'options': [
  {'id': 'safety_first', 'text': '生命安全优先，紧急出口可人工释放，原始记录保留供独立审查。'},
  {'id': 'reset_all', 'text': '重置全部设备并清空记录，继续沿用原来的夜间流程。'},
  {'id': 'stricter_lock', 'text': '进一步限制夜间出入，让设备更严格地执行勿扰规则。'}]},
]

# This mapping is never returned by /api/world or included in model context.
CORRECT = {'cause': 'sleep_mapping', 'responsibility': 'shared_system', 'remedy': 'safety_first'}

def valid_answers(answers):
 return (isinstance(answers, dict) and set(answers) == {q['id'] for q in QUESTIONS}
         and all(isinstance(answers[q['id']],str) and answers[q['id']] in {o['id'] for o in q['options']} for q in QUESTIONS))

def statement(answers):
 return '；'.join(q['title'] + '：' + next(o['text'] for o in q['options'] if o['id'] == answers[q['id']]) for q in QUESTIONS)
