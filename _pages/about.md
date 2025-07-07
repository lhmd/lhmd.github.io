---
permalink: /
title: ""
excerpt: ""
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---

{% if site.google_scholar_stats_use_cdn %}
{% assign gsDataBaseUrl = "https://cdn.jsdelivr.net/gh/" | append: site.repository | append: "@" %}
{% else %}
{% assign gsDataBaseUrl = "https://raw.githubusercontent.com/" | append: site.repository | append: "/" %}
{% endif %}
{% assign url = gsDataBaseUrl | append: "google-scholar-stats/gs_data_shieldsio.json" %}

<span class='anchor' id='about-me'></span>

I am a senior student at <a href='http://www.en.cs.zju.edu.cn/'>College of Computer Science and Technology</a>, <a href='https://www.zju.edu.cn/english/'>Zhejiang University</a>, majoring in **Software Engineering**, minor in Advanced Honor Class of Engineering Education(ACEE) at <a href='https://ckc.zju.edu.cn/ckcen/'>Chu Kochen Honors College</a>, and will graduate from Zhejiang University with a B.S. in Engineering in 2025! Additionally, I am an incoming PhD student at <a href='https://ziplab.github.io/'>ZIP Lab</a>@<a href='https://www.zju.edu.cn/english/'>Zhejiang University</a>, advised by Prof. <a href='https://bohanzhuang.github.io/'>Bohan Zhuang</a>


# 🔥 News
- *2025.06*: &nbsp;🎉🎉 Our paper <a href='https://wonderturbo.github.io/'>WonderTurbo</a> has been accepted to ICCV 2025!
- *2024.05*: &nbsp;🎉🎉 The national university student research project ***Research on 3D scene reconstruction and decoupling technology based on implicit neural representation***, which I am responsible for, is successfully completed!
- *2023.11*: &nbsp;🎉🎉 I win the **Zhejiang Government Scholarship**!

# 📝 Publications 

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">Preprint</div><img src='images/zpressor.jpg' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[ZPressor: Bottleneck-Aware Compression for Scalable Feed-Forward 3DGS](https://arxiv.org/abs/2505.23734)

**Weijie Wang**, Donny Y. Chen, Zeyu Zhang, Duochao Shi, Akide Liu, Bohan Zhuang

[**Project Page**](https://lhmd.top/zpressor/) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:'></span></strong>
- In this work, we analyze feed-forward 3DGS frameworks through the lens of the Information Bottleneck principle and introduce ZPressor, a lightweight architecture-agnostic module that enables efficient compression of multi-view inputs into a compact latent state Z that retains essential scene information while discarding redundancy.

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">Preprint</div><img src='images/pmloss.png' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[Revisiting Depth Representations for Feed-Forward 3D Gaussian Splatting](https://arxiv.org/abs/2506.05327)

Duochao Shi†, **Weijie Wang**†, Donny Y. Chen, Zeyu Zhang, Jia-Wang Bian, Bohan Zhuang, Chunhua Shen († equal contribution)

[**Project Page**](https://aim-uofa.github.io/PMLoss/) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:'></span></strong>
- We introduce PM-Loss, a novel regularization loss based on a pointmap predicted by a pre-trained transformer. It effectively enforces geometric smoothness, especially around object boundaries. With the improved depth map, our method significantly improves the feed-forward 3DGS across various architectures and scenes, delivering consistently better rendering results.

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">Preprint</div><img src='images\revisual_r1.png' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[Advancing Multimodal Reasoning: From Optimized Cold Start to Staged Reinforcement Learning](https://arxiv.org/abs/2506.04207)

Shuang Chen†, Yue Guo†, Zhaochen Su, Yafu Li, Yulun Wu, Jiacheng Chen, Jiayu Chen, **Weijie Wang**, Xiaoye Qu, Yu Cheng († equal contribution)

[**Project Page**](https://github.com/CSfufu/Revisual-R1) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:UeHWp8X0CEIC'></span></strong>
- We introduce ReVisual-R1, achieving a new state-of-the-art among open-source 7B MLLMs on challenging benchmarks including MathVerse, MathVision, WeMath, LogicVista, DynaMath, and challenging AIME2024 and AIME2025.

</div>
</div>

<!-- <div class='paper-box'><div class='paper-box-image'><div><div class="badge">Preprint</div><img src='images/segbins.png' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[SegBins: Self-Supervised Monocular Depth Estimation Based On Depth Bins And Semantic Segmentation](https://lhmd.top)

Yicheng Xiao†, Haoxuan Ma†, Zhenhao Shen, Jinfei Qi, RuiFeng Xie, Zixiang Zhang, Haoxiao Wang, **Weijie Wang**, Peilin Sun, Jiale Hong, Jingyang Fan, Xiaolin Fang, Haiyun Guo, Jinqiao Wang († equal contribution)

[**Project Page**](https://lhmd.top) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:'></span></strong>
- We propose a new self-supervised monocular depth estimation framework, which innovatively proposes that the framework enhances spatial interaction information and applies multi-layer feature fusion information to extract potential geometric priors of scenes in images, and finally classifies them into multiple depth bin to obtain probabilities, which are combined to form depth. 

</div>
</div> -->

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">Preprint</div><img src='images/sciknoweval.png' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[SciKnowEval: Evaluating Multi-level Scientific Knowledge of Large Language Models](https://arxiv.org/abs/2406.09098)

Kehua Feng†, Keyan Ding†, **Weijie Wang**†, Xiang Zhuang, Zeyuan Wang, Ming Qin, Yu Zhao, Jianhua Yao, Qiang Zhang, Huajun Chen († equal contribution)

[**Project Page**](http://scimind.ai/sciknoweval/) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:u-x6o8ySG0sC'></span></strong>
- This paper introduce the SciKnowEval benchmark, a novel framework that systematically evaluates LLMs across five progressive levels of scientific knowledge. Specifically, we take biology and chemistry as the two instances of SciKnowEval and construct a dataset encompassing 50K multi-level scientific problems and solutions.

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">ICCV2025</div><img src='images/wonderturbo.png' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[WonderTurbo:Generating Interactive 3D World in 0.72 Seconds](https://www.arxiv.org/abs/2504.02261)

Chaojun Ni†, Xiaofeng Wang†, Zheng Zhu†, **Weijie Wang**†, Haoyun Li, Guosheng Zhao, Jie Li, Wenkang Qin, Guan Huang, Wenjun Mei († equal contribution)

[**Project Page**](https://wonderturbo.github.io/) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:UeHWp8X0CEIC'></span></strong>
- We introduce WonderTurbo, the first real-time interactive 3D scene generation framework capable of generating novel perspectives of 3D scenes within 0.72 seconds. Specifically, WonderTurbo accelerates both geometric and appearance modeling in 3D scene generation.

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">ICRA2025</div><img src='images/transdiff.jpg' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[TransDiff: Diffusion-Based Method for Manipulating Transparent Objects Using a Single RGB-D Image](https://arxiv.org/abs/2503.12779)

Haoxiao Wang†, Kaichen Zhou†, Binrui Gu, Zhiyuan Feng, **Weijie Wang**, Peilin Sun, Yicheng Xiao, Jianhua Zhang, Hao Dong († equal contribution)

[**Project Page**](https://wang-haoxiao.github.io/TransDiff/) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:'></span></strong>
- We propose a single-view RGB-D-based depth completion framework, TransDiff, that leverages the Denoising Diffusion Probabilistic Models(DDPM) to achieve material-agnostic object grasping in desktop. 

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">ECCV2024</div><img src='images/street_gaussians.jpg' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

[Street gaussians for modeling dynamic urban scenes](https://arxiv.org/abs/2401.01339)

Yunzhi Yan, Haotong Lin, Chenxu Zhou, **Weijie Wang**, Haiyang Sun, Kun Zhan, Xianpeng Lang, Xiaowei Zhou, Sida Peng

[**Project Page**](https://zju3dv.github.io/street_gaussians/) <strong><span class='show_paper_citations' data='Hsxmwr0AAAAJ:u5HHmVD_uO8C'></span></strong>
- This paper aims to tackle the problem of modeling dynamic urban street scenes from monocular videos. We introduce Street Gaussians, a new explicit scene representation that tackles some major limitations.

</div>
</div>

# 🎖 Honors and Awards
- *2024.11* Third Class Scholarship in Zhejiang University 
- *2024.10* Outstanding Students of Zhejiang University
- *2024.10* Innovation and Entrepreneurship Pioneer of Zhejiang University
- *2024.10* Academic Excellence Pioneer of Zhejiang University
- *2024.06* Third Prize of Zhejiang University "Dandelion" University Student Entrepreneurship Competition
- *2023.11* Zhejiang Government Scholarship
- *2023.11* Zhejiang University Jiecang Linear Motion Technology Scholarship 
- *2023.11* Second Class Scholarship in Zhejiang University 
- *2023.10* Academic Excellence Pioneer of Zhejiang University
- *2023.10* Academic Progressive Role Model in Zhejiang University
- *2023.08* Third Prize of Asia and Pacific Mathematical Contest in Modeling
- *2023.06* Third Prize in the Final of the 16th Mock Mayor's Forum of Zhejiang University
- *2023.01* Meritorious Winner of The Interdisciplinary Contest in Modeling
- *2023.01* Second Prize of National College Students Mathematics Competition in Zhejiang Province
- *2023.01* Third Prize of National College Students' Physics Competition in Zhejiang Province
- *2022.11* Third Class Scholarship in Zhejiang University 
- *2022.10* Academic Excellence Pioneer of Zhejiang University
- *2021.01* Second Prize of China National Mathematics Olympiad in Shaanxi Province
- *2021.01* Third Prize of Chinese Physics Olympiad in Shaanxi Province
- *2020.07* Merit Student of Shaanxi Province
- *2020.01* Third Prize of Chinese Chemistry Olympiad in Shaanxi Province
- *2019.12* Outstanding Middle School Student, Xi'an City, Shaanxi Province

# 📖 Educations
- *2021.09 - 2025.06 (now)*, <a href='https://www.zju.edu.cn/english/'>Zhejiang University</a>. I am currently pursuing a Bachelor's degree in Software Engineering with a minor in Advanced Honor Class of Engineering Education at <a href='https://ckc.zju.edu.cn/ckcen/'>Chu Kochen Honors College</a>. 
- *2018.09 - 2021.06*, <a href='https://cadyzx.a.101.com/'>Xian Changan No.1 High School</a>. I was a student in the experimental class of Chang'an No. 1 High School and was tutored for high school competitions at the same time.

# 💬Talks
- *06/16/2025* Invited talk <a href='https://www.bilibili.com/video/BV1NLN8zpENu'>ZPressor: Bottleneck-Aware Compression for Scalable Feed-Forward 3DGS</a> at <a href='https://www.3dcver.com/'>3DCVer</a>, you can find the slides <a href='https://lhmd.top/pdfs/ZPressor.pdf'>here</a>.

# 🪑Academic Service
- **Journal Reviewer**: IEEE Transactions on Visualization and Computer Graphics (TVCG)
- **Conference Reviewer**: NeurIPS 2025

# 💻 Teaching Assistant
- *Spring 2025* **Database System**, with Prof. <a href='https://person.zju.edu.cn/en/miaoxy_en'>Xiaoye Miao</a>
- *Spring 2024* **Database System**, with Prof. <a href='https://person.zju.edu.cn/en/bzhou'>Bo Zhou</a>
