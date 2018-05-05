---
layout: post
title: "impala测试"
date: 2018-05-04 12:58
comments: true
category: Hadoop
tags:
	- impala
---


#### 测试思路

* 从单表开始，区分外部表与内部表，进行count、group by等

* 多表关联，join


<!-- more -->


#### 测试过程

-----
##### 一、 单表测试 （选取外部表 ：weblog.clicklog）

##### 测试sql

``` sql
select count(distinct t.id) from test.log t where t.day >= '20180101'
```

>注：impala里不是默认数字为字符串，表中day类型为string，故必须加引号，hive里不需要;

##### 在执行sql程序时，需要查看表结构和表列结构，以及sql查询的执行计划

``` java
SHOW TABLE STATS test.log; // 查看表结构
//部分结果：
[master3.xxx:21000] > show table stats test.log;
Query: show table stats test.log
+----------+------------+--------+-----------+--------------+-------------------+--------+-------------------+------------------------------------+
| day      | #Rows      | #Files | Size      | Bytes Cached | Cache Replication | Format | Incremental stats | Location                           |
+----------+------------+--------+-----------+--------------+-------------------+--------+-------------------+------------------------------------+
| 2011     | 67949737   | 27     | 10.83GB   | NOT CACHED   | NOT CACHED        | TEXT   | true              | hdfs://outputpath/log/2011         |
| 2012     | 192232112  | 43     | 29.28GB   | NOT CACHED   | NOT CACHED        | TEXT   | true              | hdfs://outputpath/log/2012         |
| 2013     | 228772618  | 49     | 38.02GB   | NOT CACHED   | NOT CACHED        | TEXT   | true              | hdfs://outputpath/log/2013         |
| 2014     | 297606490  | 58     | 49.50GB   | NOT CACHED   | NOT CACHED        | TEXT   | true              | hdfs://outputpath/log/2014         |
| 2015     | 242917770  | 46     | 41.65GB   | NOT CACHED   | NOT CACHED        | TEXT   | true              | hdfs://outputpath/log/2015         |
| 2016     | 601817475  | 59     | 111.37GB  | NOT CACHED   | NOT CACHED        | TEXT   | true              | hdfs://outputpath/log/2016         |
| 20170314 | 62669849   | 116    | 14.64GB   | NOT CACHED   | NOT CACHED        | TEXT   | true              | hdfs://outputpath/log/fullvisitlog
```

``` java
SHOW COLUMN STATS test.log; // 查看表列结构
//示例：
[master3.xxx:21000] > show column stats test.log;
Query: show column stats test.log
+------------------+--------+------------------+--------+----------+-------------------+
| Column           | Type   | #Distinct Values | #Nulls | Max Size | Avg Size          |
+------------------+--------+------------------+--------+----------+-------------------+
| sessionid        | STRING | 5482802          | -1     | 42       | 9.360500335693359 |
| id               | INT    | 6539936          | -1     | 4        | 4                 |
| ip               | STRING | 11691739         | -1     | 20       | 13.18490028381348 |
| day              | STRING | 329              | 0      | -1       | -1                |
+------------------+--------+------------------+--------+----------+-------------------+
```

``` sql
explain select count(*) from test.log t -- 查看sql执行计划
--示例：
[master3.xxx:21000] > explain select count(distinct t.id) from test.log t where t.day >= '20180101';
Query: explain select count(distinct t.id) from test.log t where t.day >= '20180101'
+------------------------------------------------------------------------------------+
| Explain String                                                                     |
+------------------------------------------------------------------------------------+
| Max Per-Host Resource Reservation: Memory=68.00MB                                  |
| Per-Host Resource Estimates: Memory=3.52GB                                         |
| WARNING: The following tables are missing relevant table and/or column statistics. |
| weblog.clicklog                                                                    |
|                                                                                    |
| PLAN-ROOT SINK                                                                     |
| |                                                                                  |
| 06:AGGREGATE [FINALIZE]                                                            |
| |  output: count:merge(t.id)                                                    |
| |                                                                                  |
| 05:EXCHANGE [UNPARTITIONED]                                                        |
| |                                                                                  |
| 02:AGGREGATE                                                                       |
| |  output: count(t.id)                                                          |
| |                                                                                  |
| 04:AGGREGATE                                                                       |
| |  group by: t.id                                                               |
| |                                                                                  |
| 03:EXCHANGE [HASH(t.id)]                                                        |
| |                                                                                  |
| 01:AGGREGATE [STREAMING]                                                           |
| |  group by: t.id                                                               |
| |                                                                                  |
| 00:SCAN HDFS [test.log t]                                                   |
|    partitions=38/329 files=119 size=17.38GB                                        |
+------------------------------------------------------------------------------------+
```

>注：如果表每日都会更新时，需要对impala中的表更新，才能与hive中的表同步；

##### impala与hive同步

``` java
INVALIDATE METADATA;                   //重新加载所有库中的所有表

INVALIDATE METADATA [table] ;           //重新加载指定的某个表

REFRESH [table];                             //刷新某个表

REFRESH [table] PARTITION [partition];       //刷新某个表的某个分区
```

* 使用原则

如果在使用过程中涉及到了元数据或者数据的更新，则需要使用这两者中的一个操作完成，具体如何选择需要根据如下原则：

1. invalidate metadata操作比refresh要重量级;
1. 如果涉及到表的schema改变，使用invalidate metadata [table]，eg：在hive中create表后，需要在impala使用invalidate metadata [table];
1. 如果只是涉及到表的数据改变，使用refresh [table];
1. 如果只是涉及到表的某一个分区数据改变，使用refresh [table] partition [partition];
1. 禁止使用invalidate metadata什么都不加，宁愿重启catalogd;

##### 测试结果

impala
```
[master3.xxx:21000] > select count(distinct t.id) from test.log t where t.day >= '20180101';
Query: select count(distinct t.id) from test.log t where t.day >= '20180101'
Query submitted at: 2018-02-08 11:26:49 (Coordinator: http://master3.xxx:25000)
Query progress can be monitored at: http://master3.xxx.cn:25000/query_plan?query_id=26450a1b2ff192cd:4eb613700000000
+-------------------------+
| count(distinct t.webid) |
+-------------------------+
| 537135                  |
+-------------------------+
Fetched 1 row(s) in 56.45s
```

hive
```
hive> select count(distinct t.id) from test.log t where t.day >= '20180101';
Query ID = knox_20180208113005_f7aa9011-fbc0-4355-86c5-5877d0b9e385
Total jobs = 1
Launching Job 1 out of 1
Tez session was closed. Reopening...
Session re-established.
Status: Running (Executing on YARN cluster with App id application_1517483782112_3346)

--------------------------------------------------------------------------------
        VERTICES      STATUS  TOTAL  COMPLETED  RUNNING  PENDING  FAILED  KILLED
--------------------------------------------------------------------------------
Map 1 ..........   SUCCEEDED    950        950        0        0       0       0
Reducer 2 ......   SUCCEEDED     70         70        0        0       0       0
Reducer 3 ......   SUCCEEDED      1          1        0        0       0       0
--------------------------------------------------------------------------------
VERTICES: 03/03  [==========================>>] 100%  ELAPSED TIME: 53.57 s
--------------------------------------------------------------------------------
OK
537135
Time taken: 71.619 seconds, Fetched: 1 row(s)
```

* 从测试结果上看，两者从运行速度上并没有什么差别，没有网上说的比hive有十倍或者十几倍的差距；

* 故考虑impala的性能优化

##### impala性能优化

目前从表结构以及执行计划中发现的，并结合网上查找的资料，进行以下两点优化，以后对impala有更深的了解后，再进行补充：

##### 1. 表的存储结构

从SHOW TABLE STATS命令中可以发现 表的format，上述测试的test.log的format是TEXT；

在网上查找资料，参考[hive表的文件存储格式](http://blog.csdn.net/mtj66/article/details/53968991)

发现parquet格式与impala组合会提高表的查询效率，故测试建立parquet存储格式的临时表；

``` sql
-- hive
create table temp_log_20180209 as
select * from test.log t where t.day >= '20180101';

create table temp_parquet_log_20180209 like temp_log_20180209 stored as parquet;

insert overwrite table temp_parquet_log_20180209
select * from temp_log_20180209;

-- impala
invalidate metadata temp_parquet_log_20180209;
refresh temp_parquet_log_20180209;

-- 查询一下表，看表是否与hive同步
select * from temp_parquet_log_20180209 limit 5;

-- 测试sql
select count(distinct t.id) from temp_parquet_log_20180209 t;

[master3.xxx:21000] > select count(distinct t.id) from temp_parquet_log_20180209 t;
Query: select count(distinct t.id) from temp_parquet_log_20180209 t
Query submitted at: 2018-02-09 10:41:47 (Coordinator: http://master3.xxx:25000)
Query progress can be monitored at: http://master3.xxx:25000/query_plan?query_id=3e419e1a5cd39ff3:214415700000000
+-------------------------+
| count(distinct t.id)    |
+-------------------------+
| 543267                  |
+-------------------------+
Fetched 1 row(s) in 2.50s

--ps: 与之前TEXT格式测试的结果不一致时因为文档编写时间不在同一天，sql选取的时间（20180101——当前日期）在同一天结果是一致的；
```

表的存储格式修改后，impala的查询效率确定有提高，从56.25s 到 2.50s ;

##### 2. 表信息计算

在explain命令中，查看执行计划中发现里面存在warning，在网上查找资料，了解warning内容；
```
WARNING: The following tables are missing relevant table and/or column statistics.
```

大致意思应该是缺失对表的表信息与列信息的统计数据;

当统计信息可用时，Impala 可以更好的优化复杂的或多表查询，可以更好地理解数据量和值的分布，并使用这些信息帮助查询并行处理和分布负载。这里impala提供里对表信息更详尽统计的命令：
``` java
COMPUTE STATS tablename;  //对于不分区的表，或者虽然分区，但一次加载，不会再更新新分区的表，使用COMPUTE STATS更好

COMPUTE INCREMENTAL STATS tablename; //更适合要频繁增加具有大量数据的分区的表

COMPUTE INCREMENTAL STATS test.log PARTITION(day='20180208'); //单独添加一个分区的例子
```

-----------------------------

##### 二、表关联查询 (join)

选取表：temp_parquet_log_20180209 、parquet_user(存储格式为parquet的用户信息表)

##### 测试sql
``` sql
-- impala
select u.province_name,count(distinct t.id) nums
from temp_parquet_log_20180209 t,parquet_user u
where t.id = u.id
group by u.province_name limit 5;

[master3.xxx:21000] > select u.province_name,count(distinct t.id) nums
                              > from temp_parquet_log_20180209 t,parquet_user u
                              > where t.id = u.id
                              > group by u.province_name limit 5;
Query: select u.province_name,count(distinct t.id) nums
from temp_parquet_log_20180209 t,parquet_user u
where t.id = u.id
group by u.province_name limit 5
Query submitted at: 2018-02-09 11:45:40 (Coordinator: http://master3.xxx:25000)
Query progress can be monitored at: http://master3.xxx:25000/query_plan?query_id=411b014308ff95:ea54e37200000000
+---------------+-------+
| province_name | nums  |
+---------------+-------+
| AAA          | 7542  |
| BBB          | 492   |
+--------------+-------+
Fetched 5 row(s) in 15.67s

-- hive
hive> select u.province_name,count(distinct t.id) nums
    > from temp_parquet_log_20180209 t,parquet_user u
    > where t.id = u.id
    > group by u.province_name limit 5;
Query ID = knox_20180209113911_032594e3-15aa-4063-9300-58aefe2d94f8
Total jobs = 1
Launching Job 1 out of 1
Tez session was closed. Reopening...
Session re-established.
Status: Running (Executing on YARN cluster with App id application_1517483782112_3824)

--------------------------------------------------------------------------------
        VERTICES      STATUS  TOTAL  COMPLETED  RUNNING  PENDING  FAILED  KILLED
--------------------------------------------------------------------------------
Map 1 ..........   SUCCEEDED    227        227        0        0       0       0
Map 3 ..........   SUCCEEDED     51         51        0        0       0       0
Reducer 2 ......   SUCCEEDED      4          4        0        0       0       0
--------------------------------------------------------------------------------
VERTICES: 03/03  [==========================>>] 100%  ELAPSED TIME: 86.82 s
--------------------------------------------------------------------------------
OK
AAA  7542
BBB  492
Time taken: 97.863 seconds, Fetched: 5 row(s)
```

这里，我已经对两个表进行了compute table的处理，可以看出效率比hive高，但是，我们在查询之前却没有看sql的执行计划，看是否还有调优的地方；

#### join调优的原则

1. 最大的表放首位。这个表在查询的时候是每个impala节点直接从磁盘读取的，因此它的大小对于内存使用没影响。
1. 然后按表大小有大到小依次排序。这些表的内容全部都是要在网络中传递的，所以，表越到后面越小越好。
1. 通过执行COMPUTE STATS来收集涉及到的所有表的统计信息

>值得注意的一点是，这里的“大小”是就每个表在查询后生成的中间结果涉及到的行的数量来定的。比如，一次查询，要join两个表：销售表和用户表。查询的结果是100个不同的用户共有5000条消费记录。因为涉及用户表的行比销售表少（100<5000）。所以用户表应该放在后面（右边）

#### join调优
``` sql
-- 执行查询计划
select u.province_name,count(distinct t.id) nums
from temp_parquet_log_20180209 t,parquet_user u
where t.id = u.id
group by u.province_name limit 5;
-- 这里只列出执行计划结果
+---------------------------------------------------------+
| Explain String                                          |
+---------------------------------------------------------+
| Max Per-Host Resource Reservation: Memory=105.94MB      |
| Per-Host Resource Estimates: Memory=14.52GB             |
|                                                         |
| PLAN-ROOT SINK                                          |
| |                                                       |
| 10:EXCHANGE [UNPARTITIONED]                             |
| |  limit: 5                                             |
| |                                                       |
| 09:AGGREGATE [FINALIZE]                                 |
| |  output: count:merge(t.id)                            |
| |  group by: u.province_name                            |
| |  limit: 5                                             |
| |                                                       |
| 08:EXCHANGE [HASH(u.province_name)]                     |
| |                                                       |
| 04:AGGREGATE [STREAMING]                                |
| |  output: count(t.id)                                  |
| |  group by: u.province_name                            |
| |                                                       |
| 07:AGGREGATE                                            |
| |  group by: u.province_name,  t.id                     |
| |                                                       |
| 06:EXCHANGE [HASH(u.province_name,t.id)]                |
| |                                                       |
| 03:AGGREGATE [STREAMING]                                |
| |  group by: u.province_name,  t.id                     |
| |                                                       |
| 02:HASH JOIN [INNER JOIN, BROADCAST]                    |
| |  hash predicates: u.id = t.id                         |
| |  runtime filters: RF000 <- t.id                       |
| |                                                       |
| |--05:EXCHANGE [BROADCAST]                              |
| |  |                                                    |
| |  00:SCAN HDFS [temp_parquet_log_20180209 t]           |
| |     partitions=1/1 files=976 size=3.09GB              |
| |                                                       |
| 01:SCAN HDFS [parquet_user u]                           |
|    partitions=1/1 files=4 size=811.63MB                 |
|    runtime filters: RF000 -> u.id                       |
+---------------------------------------------------------+
```
从执行计划里可以看出，第二步 hash关联中，是由 用户表中的id 关联 轨迹日志中的id，并不是由轨迹日志(大)到 用户表(小);

impala中提供了一个straight_join关键词，手动调整关联顺序，即按照sql语句的顺序，而不采用impala中自动优化查询；
``` sql
explain select straight_join u.province_name,count(distinct t.id) nums
from temp_parquet_log_20180209 t,parquet_user u
where t.id = u.id
group by u.province_name limit 5;
+---------------------------------------------------------+
| Explain String                                          |
+---------------------------------------------------------+
| Max Per-Host Resource Reservation: Memory=105.94MB      |
| Per-Host Resource Estimates: Memory=14.75GB             |
|                                                         |
| PLAN-ROOT SINK                                          |
| |                                                       |
| 10:EXCHANGE [UNPARTITIONED]                             |
| |  limit: 5                                             |
| |                                                       |
| 09:AGGREGATE [FINALIZE]                                 |
| |  output: count:merge(t.id)                            |
| |  group by: u.province_name                            |
| |  limit: 5                                             |
| |                                                       |
| 08:EXCHANGE [HASH(u.province_name)]                     |
| |                                                       |
| 04:AGGREGATE [STREAMING]                                |
| |  output: count(t.id)                                  |
| |  group by: u.province_name                            |
| |                                                       |
| 07:AGGREGATE                                            |
| |  group by: u.province_name, u.area_name, t.id         |
| |                                                       |
| 06:EXCHANGE [HASH(u.province_name,t.id)]                |
| |                                                       |
| 03:AGGREGATE [STREAMING]                                |
| |  group by: u.province_name,  t.id                     |
| |                                                       |
| 02:HASH JOIN [INNER JOIN, BROADCAST]                    |
| |  hash predicates: t.id = u.id                         |
| |  runtime filters: RF000 <- u.id                       |
| |                                                       |
| |--05:EXCHANGE [BROADCAST]                              |
| |  |                                                    |
| |  01:SCAN HDFS [parquet_user u]                        |
| |     partitions=1/1 files=4 size=811.63MB              |
| |                                                       |
| 00:SCAN HDFS [temp_parquet_log_20180209 t]              |
|    partitions=1/1 files=976 size=3.09GB                 |
|    runtime filters: RF000 -> t.id                       |
+---------------------------------------------------------+

-- 在进行测试
[master3.xxx:21000] > select straight_join u.province_name,count(distinct t.id) nums
                              > from temp_parquet_log_20180209 t,parquet_user u
                              > where t.id = u.id
                              > group by u.province_name limit 5;
Query: select straight_join u.province_name,count(distinct t.id) nums
from temp_parquet_log_20180209 t,parquet_user u
where t.id = u.id
group by u.province_name limit 5
Query submitted at: 2018-02-09 11:42:26 (Coordinator: http://master3.xxx:25000)
Query progress can be monitored at: http://master3.xxx:25000/query_plan?query_id=a44d5d5cabe90eec:ed20c60100000000
+---------------+-------+
| province_name | nums  |
+---------------+-------+
| AAA          | 7542  |
| BBB          | 492   |
+---------------+-------+
Fetched 5 row(s) in 7.25s
```
最后测试结果又比之前提高了一倍，15.67s 到 7.25s;
