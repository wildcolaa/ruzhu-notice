"""Canonical collision geometry and interaction anchors, shared with the client via /api/world."""
import math
AGENTS = {
 'yuanyuan': {'name':'圆圆','role':'地面清洁 / 移动目击者','position':[-2,1.6], 'color':'#91c9bb'},
 'shouze': {'name':'守则','role':'出入管理 / 授权审查','position':[-6.2,3.2], 'color':'#d7b880'},
 'xiaoye': {'name':'小夜','role':'照明控制 / 传感记录','position':[.4,-3.6], 'color':'#ead6a6'},
 'jia': {'name':'家','role':'中央调度 / 责任审查','position':[6,-2.7], 'color':'#bcb5df'},
}
OBJECTS = {
 'notice':{'name':'住户须知','position':[-5.2,2.9]},
 'report':{'name':'封存的鉴定摘要','position':[1.6,.5]},
 'medicine':{'name':'床头的空药瓶','position':[-4.3,-2.9]},
 'stain':{'name':'地板上的弧形划痕','position':[-3,-.5]},
 'receipt':{'name':'过期配送单','position':[4.3,-.1]},
 'archive':{'name':'维护存储器','position':[5.2,-3.9]},
}
# [x1,z1,x2,z2], furniture/wall occupied rectangles. Passage is at z > -0.9.
SOLIDS=[[-1.85,-4.8,-1.55,-1.0],[-6.0,-4.3,-3.6,-2.0],[-6,-1.9,-5.15,-1.1],
 [-.8,2.1,2.3,3.1],[.3,.0,2.7,1.0],[2.8,-4.7,5.5,-3.6],
 [4.9,1.5,6.6,3.4],[-5.0,-4.6,-3.4,-4.0]]
def walkable(x,z,r=.22):
 if not (-6.7<=x<=6.7 and -4.6<=z<=4.6):return False
 return not any(a-r<x<c+r and b-r<z<d+r for a,b,c,d in SOLIDS)
def clear_path(a,b):
 n=max(1,math.ceil(math.dist(a,b)/.08))
 return all(walkable(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n) for i in range(1,n+1))
def near(s,target):
 p=s['robot'] if target=='yuanyuan' else (AGENTS.get(target) or OBJECTS.get(target) or {}).get('position')
 return p is not None and math.dist(s['player'],p)<2.15

# Current-night cleaning is different from the signed historical reconstruction.
CASE_ROUTE=[[-2,1.6],[-2,-.5],[-3,-.5],[-4.4,-.6],[-4.4,-1.4],[-3,-.5],[-2,1.6]]
PATROL_ROUTE=[[-4.2,-1.3],[-3,-.5],[-2,-.5],[-2,1.6],[-.8,1.5],[.5,1.5],[2.8,1.5],[3.6,.7],[3.6,-1.7],[1,-1.7],[.4,-3.3],[.4,-1.7],[-.6,-.5],[-3,-.5],[-4.2,-1.3]]
BLOOD_SOURCE=[-4.2,-1.3]
