import json,calendar,datetime,math,sys
src=json.load(open(sys.argv[1]))
months={}
for row in src['rows']:
 if row['digits']!=2 or row['position']!='สองบน':continue
 y=int(row['year'])+1957;s=row['sequence'];offset=0
 for m in range(1,13):
  length=calendar.monthrange(y,m)[1];parts=[s[i:i+2] for i in range(offset*2,(offset+length)*2,2)]
  months[y*12+m-1]=[int(v) for v in parts if len(v)==2 and v.isdigit()];offset+=length
names=['Top','Mid','Bottom','Top+Mid','Top+Bottom','Mid+Bottom','Top+Mid+Bottom']
recipes=[(g,w,n) for g in names for w in range(3,13) for n in range(40,61)]
def pool(data,g):
 counts=[data.count(v) for v in range(100)]
 rank=sorted(range(100),key=lambda v:(-counts[v],v))
 queues={'Top':rank[:34],'Mid':sorted(rank[34:67],key=lambda v:(abs(rank.index(v)-50),v)), 'Bottom':sorted(rank[67:],key=lambda v:(counts[v],v))}
 def weave(gs):return [queues[g][i] for i in range(34) for g in gs if i<len(queues[g])]
 selected=g.split('+');base=weave(selected)+weave([x for x in ['Top','Mid','Bottom'] if x not in selected])
 intervals=[];gaps=[]
 for v in range(100):
  at=[i for i,x in enumerate(data) if x==v]
  intervals += [b-a-1 for a,b in zip(at,at[1:])]
  gaps.append(len(data)-1-at[-1] if at else len(data))
 hot=sorted(counts)[94];limit=sorted(intervals)[math.ceil(len(intervals)*.95)-1] if intervals else None
 overdue=sorted([v for v in range(100) if limit is not None and gaps[v]>limit and counts[v]<=hot],key=lambda v:(-gaps[v],v))
 adjusted=overdue+[v for v in base if v not in overdue and counts[v]<=hot]
 return base,adjusted
scores={};pools={}
for month in range(2025*12+6,2026*12+9):
 for w in range(3,13):
  data=sum([months[m] for m in range(month-w,month)],[])
  for g in names:
   b,a=pool(data,g);pools[month,g,w]=(b,a)
   for n in range(40,61):
    scores[month,g,w,n]=100*sum(v in a[:n] for v in months[month])-n*len(months[month])
actual=json.load(open(sys.argv[2]));checks=0
for row in actual['months']:
 m=row['month']; profits=[sum(scores[v,g,w,n] for v in range(m-6,m)) for g,w,n in recipes]
 best=min(range(len(recipes)),key=lambda i:(-profits[i],recipes[i][2],i));g,w,n=recipes[best]
 assert row['recipe']=={'group':g,'window':w,'n':n}
 assert row['validationProfit']==profits[best]
 assert row['profit']==scores[m,g,w,n]
 b,a=pools[m,g,w]
 assert row['numbers']==[f'{v:02}' for v in a[:n]]
 assert row['baseProfit']==100*sum(v in b[:n] for v in months[m])-n*len(months[m])
 checks+=5
print(f'Independent Python: {checks} checks, all 9 months match selections, validation and profits')
