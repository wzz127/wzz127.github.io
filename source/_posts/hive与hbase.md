---
layout: post
title: "hive 与 hbase"
date: 2018-05-04 14:58
comments: true
category: Hadoop
tags:
	- hadoop
---


### 一、从Hbase、hive如何产生的角度看

Hadoop的起源于google的三大论文：

    GFS：Google的分布式文件系统Google File System
    MapReduce：Google的MapReduce开源分布式并行计算框架 
    BigTable：一个大型的分布式数据库

其中的演变关系：
    
    GFS ——> HDFS
    Google MapReduce——>Hadoop MapReduce 
    BigTable ——> Hbase


<!-- more -->

Hadoop的核心是HDFS和MapReduce，Hbase和hive都是在此基础上发展来的。HDFS（Hadoop Distributed File System，Hadoop分布式文件系统），它是一个高度容错性的系统，适合部署在廉价的机器上。HDFS能提供高吞吐量的数据访问，适合那些有着超大数据集（large data set）的应用程序。

Hbase作为面向列的数据库运行在HDFS之上，HDFS缺乏随即读写操作，Hbase正是为此而出现。HBase以Google BigTable为蓝本，以键值对的形式存储。项目的目标就是快速在主机内数十亿行数据中定位所需的数据并访问它。
MapReduce是一套从海量源数据提取分析元素最后返回结果集的编程模型。MapReduce的基本原理就是：将大的数据分析分成小块逐个分析，最后再将提取出来的数据汇总分析，最终获得我们想要的内容。

但是，MapReduce需要编写java代码，对于习惯使用mysql等数据库进行数据处理与分析的工作人员，使用不是很方便，Hive就由此而产生。

Hive起源于FaceBook，在Hadoop中扮演数据仓库的角色，建立在Hadoop集群的最顶层，对存储在Hadoop群上的数据提供类SQL的接口进行操作。你可以用 HiveQL进行select，join，等等操作。如果你有数据仓库的需求并且你擅长写SQL并且不想写MapReduce jobs就可以用Hive代替，用Hive开离线的进行数据处理与分析工作。

------------------

### 二、Hbase、Hive相关概况知识

Hbase是一个数据库，一个NoSql的数据库，像其他数据库一样提供随即读写功能，Hadoop不能满足实时需要，Hbase正可以满足。如果你需要实时访问一些数据，就把它存入HBase。

官方对Hbase的解释：

    Use Apache HBase™ when you need random, realtime read/write access to your Big Data. 
    This project's goal is the hosting of very large tables 
    -- billions of rows X millions of columns – a top clusters of commodity hardware. 

Hbase以键值对的形式储存数据。其包含了4种主要的数据操作方式:

1. 添加或更新数据行；
1. 扫描获取某范围内的cells；
1. 为某一具体数据行返回对应的cells；
1. 从数据表中删除数据行/列，或列的描述信息，列信息可用于获取数据变动前的取值；

Hive是基于Hadoop的一个数据仓库工具，可以将结构化的数据文件映射为一张数据库表，并提供完整的sql查询功能，可以将sql语句转换为MapReduce任务进行运行。

官方对Hive的解释：

    The Apache Hive ™ data warehouse software facilitates reading, 
    writing, and managing large datasets residing in distributed storage using SQL. 
    Structure can be projected onto data already in storage.
    A command line tool and JDBC driver are provided to connect users to Hive.

Hive以表的形式存储数据。其数据存储模型主要有：

1. 内部表。分为真实数据（存储在HDFS上）和表格中的元数据（存储在关系型数据库中）；
1. 外部表。建立与HDFS与Hbase的映射，指定仓库目录以外的位置访问数据；
1. 分区。对表进行分区管理，提高管理与查询效率；
1. 桶。把表组织成桶，更加高效的处理与查询大规模数据集；

---------------------

### 三、两者的使用场景

* Hbase的应用场景：

1. 成熟的数据分析主题，查询模式已经确立，并且不会轻易改变；
1. 传统的关系型数据库已经无法承受负荷，高速插入，大量读取；

* Hive的应用场景：

1. Hive适用于网络日志等数据量大、静态的数据查询。例如：用户消费行为记录，网站访问足迹等。但是不适用于联机实时在线查询的场合。
1. Hive更适合于数据仓库的任务，Hive主要用于静态的结构以及需要经常分析的工作。Hive与SQL相似促使 其成为Hadoop与其他BI工具结合的理想交集

------------------------

### 四、Hive与Hbase的联系与区别

* 联系：

Hbase与Hive都是架构在hadoop之上的，都是用HDFS作为底层存储的；
Hbase可以在Hive中建立映射，在Hive上分析Hbase中表的数据；

* 区别：

Hive本身不存储和计算数据，它完全依赖于HDFS和MapReduce，Hive中的表纯逻辑。Hive需要用到HDFS存储文件，需要用到MapReduce计算框架。

Hbase是物理表，不是逻辑表，提供一个超大的内存hash表，搜索引擎通过它来存储索引，方便查询操作；


----------------------

##### Ps:

转自一篇网上的一段评论

“hive和hbase哪里像了，好像哪里都不像，既然哪里都不像，又何来的“区别是什么”这一问题，他俩所有的都算区别。

那么，hive是什么？

白话一点再加不严格一点，hive可以认为是map-reduce的一个包装。hive的意义就是把好写的hive的sql转换为复杂难写的map-reduce程序。

于是，hbase是什么？

同样白话一点加不严格一点，hbase可以认为是hdfs的一个包装。他的本质是数据存储，是个NoSql数据库；hbase部署于hdfs之上，并且克服了hdfs在随机读写方面的缺点。”       



