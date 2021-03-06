var isLoaded = false;
var isScrolling = false;
var PAGEID = "slice";
var menuRouter = "";
var CONTENT = {};
var POSTS = [];
var CATEGORIES = {};
var TAGS = {};
var CURRENT = -1;
var disqus_config = null;

$(window).ready(function() {
    if (getHash() == "" || getHash() == "#") gotoHash("/home");
    loadContents(() => {
        if (getHashPre() != "articles") {
            showHome();
            menuRouter = "#/home";
        }
        flashHashEvent("");
    });
    prepareClock();
    //prepareSong();
});

var timerDom = $(".sitestate time");
var prepareClock = () => {
    setInterval(() => {
        var sub = parseInt((parseInt(Date.now()) - parseInt(UPDATETIME)) / 1000);
        var s = sub % 60,
            m = parseInt(sub / 60) % 60,
            h = parseInt(sub / 60 / 60) % 24,
            d = parseInt(sub / 60 / 60 / 24);
        s = s < 10 ? "0" + s : "" + s;
        m = m < 10 ? "0" + m : "" + m;
        h = h < 10 ? "0" + h : "" + h;
        timerDom.html(`${d} days ${h}:${m}:${s}`);
    }, 1000);
}

var nextScroll = (f, ht) => {
    if (typeof(ht) === "undefined") ht = $(window).scrollTop();
    $(window).scrollTop(ht);
    if(ht > 0) {
        isScrolling = true;
        setTimeout(() => {
            nextScroll(f, ht - 50);
        },10);
    } else {
        isScrolling = false;
        if(f) f();
    };
}

var loadContents = (callback) => {
    if (CONTENTURL == "" || isLoaded) {
        callback();
        return;
    }
    $.get(CONTENTURL, (e) => {
        if (e) {
            isLoaded = true;
            CONTENT = e;
            initContent();
            showArticle();
            loadArticleByNum(0, true);
            $("#mploading").css("display", "none");
            $("#mptoggle").addClass("mpToggleShow");
        }
        callback();
    });
}

var getIndexBySlug = (e) => {
    for (var i = 0; i < POSTS.length; i++) {
        if (POSTS[i].slug == e) return i;
    }
    return -1;
}

var initContent = () => {
    POSTS = CONTENT.posts;
    for (var i in POSTS) {
        var _t = POSTS[i].tags;
        for (var j in _t) {
            if (TAGS.hasOwnProperty(_t[j].name)) {
                TAGS[_t[j].name].push(i);
            } else {
                TAGS[_t[j].name] = [i];
            }
        }
        var _c = POSTS[i].categories;
        for (var j in _c) {
            if (CATEGORIES.hasOwnProperty(_c[j].name)) {
                CATEGORIES[_c[j].name].push(i);
            } else {
                CATEGORIES[_c[j].name] = [i];
            }
        }
    }
}

var showMenu = (e = 1) => {
    if (e != 1) {
        if (e == 0) {
            $("#menu").removeClass("show");
            $("#open").removeClass("opened");
            $("#container").removeClass("blur");
            menuRouter = "";
        } else {
            $("#menu").addClass("show");
            $("#open").addClass("opened");
            $("#container").addClass("blur");
        }
        return;
    }
    if ($("#menu").hasClass("show")) {
        $("#menu").removeClass("show");
        $("#open").removeClass("opened");
        $("#container").removeClass("blur");
        if (menuRouter != "") {
            setHash(menuRouter);
            menuRouter = "";
        }
    } else {
        $("#menu").addClass("show");
        $("#open").addClass("opened");
        $("#container").addClass("blur");
    }
}

var addTable = (a, b, c, jump=false) => {
    var _t = $("#linktable");
    var html = _t.html();
    
    var addOns = jump ? 'target="_blank"' : '';
    html += `<a ${addOns} href="${a}"><li>${b}</li><p>${c}</p></a>`;
    _t.html(html);
}

var clearTable = () => {
    var _t = $("#linktable");
    _t.html("");
}

var showHome = () => {
    $("#mainpage").addClass("showmain");
    $("meta[name='apple-mobile-web-app-status-bar-style']").attr("content", "default");
    loadArticleByNum(0, true);
}

var showLink = () => {
    clearTable();
    for (var i in FRIENDLIST) {
        var name = i;
        if (FRIENDLIST[i].indexOf("https://") == 0) {
            name = "<green>[SSL]</green> " + i;
        }
        addTable(`${FRIENDLIST[i]}`, name, FRIENDLIST[i], true);
    }
}

var showCate = (e = null) => {
    clearTable();
    if (!e) {
        for (var i in CATEGORIES) {
            addTable(`#/category/${i}`, i, CATEGORIES[i].length);
        }
    } else {
        if (CATEGORIES.hasOwnProperty(decodeURI(e))) {
            var _p = CATEGORIES[decodeURI(e)];
            for (var i in _p) {
                addTable(`#/articles/${POSTS[_p[i]].slug}`, POSTS[_p[i]].title, POSTS[_p[i]].excerpt || POSTS[_p[i]].title);
            }
        } else if (CATEGORIES.hasOwnProperty(encodeURI(e)))  {
            var _p = CATEGORIES[encodeURI(e)];
            for (var i in _p) {
                addTable(`#/articles/${POSTS[_p[i]].slug}`, POSTS[_p[i]].title, POSTS[_p[i]].excerpt || POSTS[_p[i]].title);
            }
        } else {
            gotoHash("/category");
        }
    }
}

var showTag = (e = null) => {
    clearTable();
    if (!e) {
        for (var i in TAGS) {
            addTable(`#/tag/${i}`, i, TAGS[i].length);
        }
    } else {
        if (TAGS.hasOwnProperty(encodeURI(e))) {
            var _p = TAGS[encodeURI(e)];
            for (var i in _p) {
                addTable(`#/articles/${POSTS[_p[i]].slug}`, POSTS[_p[i]].title, POSTS[_p[i]].excerpt || POSTS[_p[i]].title);
            }
        } else if (TAGS.hasOwnProperty(decodeURI(e))) {
            var _p = TAGS[decodeURI(e)];
            for (var i in _p) {
                addTable(`#/articles/${POSTS[_p[i]].slug}`, POSTS[_p[i]].title, POSTS[_p[i]].excerpt || POSTS[_p[i]].title);
            }
        } else {
            gotoHash("/tag");
        }
    }
}

var showArticle = () => {
    clearTable();
    for (var i = 0; i < POSTS.length; i++) {
        addTable(`#/articles/${POSTS[i].slug}`, POSTS[i].title, POSTS[i].excerpt || POSTS[i].title);
    }
}

var loadArticleByName = (e) => {
    loadArticleByNum(getIndexBySlug(e));
}

var loadArticleByNum = (e, keepHash=false) => {
    toTop(() => {
        if (e >= 0 && e < POSTS.length) {
            var _p = POSTS[e];
            if (window.location.hash != "#/articles/" + _p.slug) {
                if (!keepHash) {
                    gotoHash("/articles/" + _p.slug);
                }
            } else {
                $("#mainpage").removeClass("showmain");
                $("meta[name='apple-mobile-web-app-status-bar-style']").attr("content", "white");
            }
            $("#atitle").html(_p.title);
            $("#atime").html(_p.date);
            buildList("#acate", "#/category/", _p.categories);
            buildList("#atag", "#/tag/", _p.tags);
            $("#acontent").html(_p.content);
            if (CURRENT != e) {
                CURRENT = e;
                var head = document.getElementsByTagName("head")[0];
                var rmi = -1;
                for (var i = 0; i < head.childNodes.length; i++) {
                    if (head.childNodes[i].id == 'dsq_script') {
                        rmi = i;
                        break;
                    }
                }
                if (rmi != -1) {
                    head.removeChild(head.childNodes[rmi]);
                    var node = $("#comments_table");
                    node.html("");
                    $("#comments_button").show();
                }
            }
            $('pre code').each(function(i, block) {
                hljs.highlightBlock(block);
                var mhtml = $(block).html();
                mhtml = "<cbr>" + mhtml.split("\n").join("</cbr>\n<cbr>");
                $(block).html(mhtml.substring(0, mhtml.length - 7));
            });
            document.title = WEBNAME + " | " + _p.title;
            PAGEID = window.location.host + window.location.pathname + "articles/" + _p.slug;
        }
        showMenu(0);
    });
}

var buildList = (a, b, c) => {
    var element = $(a);
    var html = "";
    for (var i in c) {
        html += `<a href="${b}${c[i].name}"><li>${c[i].name}</li></a>`;
    }
    element.html(html);
}

var next = () => {
    loadArticleByNum(CURRENT + 1);
}

var prev = () => {
    loadArticleByNum(CURRENT - 1);
}

var toTop = (f) => {
    if (!isScrolling) nextScroll(f);
    else if (typeof(f) === "function") f();
}

var prepareSong = () => {
    nplayerList = SONGLIST;
    if (nplayerList.length) {
        playMusic(nplayerList[currentPlay]);
    }
}

var showComment = {
    "disqus": (node) => {
        node.html("<div id='disqus_thread'></div>");
        disqus_config = function () {
            this.page.url = window.location.protocol + "//" + PAGEID + "/";
            this.page.identifier = PAGEID;
        };
        var dsq = document.createElement('script');
        dsq.type = 'text/javascript';
        dsq.id = 'dsq_script';
        dsq.async = true;
        dsq.setAttribute('data-timestamp', +new Date());
        dsq.src = '//' + disqus_shortname + '.disqus.com/embed.js';
        document.getElementsByTagName('head')[0].appendChild(dsq);
    },
    "gitalk": (node) => {
        const gitalk = new Gitalk({
          clientID: GITID,
          clientSecret: GITSEC,
          repo: GITREPO,
          owner: GITOWNER,
          id: PAGEID,
          admin: [GITOWNER],
          distractionFreeMode: false,
          createIssueManually: true
        });
        gitalk.render(node);
    },
}

var showComments = () => {
    var node = $("#comments_table");
    $("#comments_button").hide();
    if (disqus_shortname) {
        showComment["disqus"](node);
    } else if (GITID) {
        showComment["gitalk"](node[0]);
    }
}

var changeRoute = (e) => {
    $("#linktabletitle").html(e);
}

$("#search").on("keyup", (e) => {
    clearTable();
    var text = $("#search").val();
    for (var i in POSTS) {
        var indexi = POSTS[i].text.toLowerCase().indexOf(text.trim().toLowerCase());
        if (indexi != -1) {
            text = POSTS[i].text.substr(indexi, text.length);
            var hint = POSTS[i].text.substring(indexi - 10, indexi + text.length + 30);
            hint = hint.replace(text, `<hl>${text}</hl>`);
            addTable(`#/articles/${POSTS[i].slug}`, POSTS[i].title, hint);
        }
    }
});

var within = (e, t, v) => {
    if (e > t - v && e < t + v) return true;
    else return false;
}

Swipe("html", (e) => {
    if (e.len < 125) return;
    if (within(e.deg, 90, 25)) {
        showMenu(0);
        //console.log("[Swipe] Swipe Right.");
    } else if (within(e.deg, 270, 25)) {
        showMenu(2);
        //console.log("[Swipe] Swipe Left.");
    } else if (within(e.deg, 180, 25) && getHashPre() == "home") {
        loadArticleByNum(0);
        //console.log("[Swipe] Swipe Up.");
    }
});