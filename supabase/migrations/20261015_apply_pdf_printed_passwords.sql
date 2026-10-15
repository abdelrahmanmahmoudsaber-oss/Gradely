-- ==============================================================================
-- GRADELY BULLETPROOF CREDENTIALS SYNC FROM PRINTED PDF CARDS (335 STUDENTS)
-- Date: 2026-10-15
-- Features:
--   1. Direct import of the 335 passwords printed on the students' physical cards
--   2. Dual-support: accepts BOTH the printed PDF password AND the Excel password
--   3. Special support for student 2302968 (s97u*eDR and b7Y3T!j*)
--   4. Special support for student 2402313 (54qr#Vzx and 2&QmGr#Y)
--   5. Recreates verify_legacy_login (bulletproof, zero rate-limiting conflicts)
--   6. Auto-records last_sign_in_at on successful login
--   7. Zero modifications to Super Admin or TA Abdelrahman credentials!
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADD last_sign_in_at COLUMN TO users
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;


-- ------------------------------------------------------------------------------
-- 2. REBUILD login_attempts TABLE CLEANLY
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.login_attempts CASCADE;

CREATE TABLE public.login_attempts (
  user_id text PRIMARY KEY,
  attempts int DEFAULT 1,
  last_attempt timestamptz DEFAULT now(),
  locked_until timestamptz
);

GRANT ALL ON public.login_attempts TO postgres, service_role;
GRANT ALL ON public.login_attempts TO authenticated, anon;


-- ------------------------------------------------------------------------------
-- 3. STORE AND APPLY PRINTED PDF & EXCEL PASSWORDS IN CREDENTIALS VAULT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_credentials_vault (
  user_id text PRIMARY KEY,
  pdf_password text NOT NULL,
  excel_password text,
  updated_at timestamptz DEFAULT now()
);

GRANT ALL ON public.student_credentials_vault TO postgres, service_role;
GRANT SELECT ON public.student_credentials_vault TO authenticated, anon;

INSERT INTO public.student_credentials_vault (user_id, pdf_password, excel_password)
VALUES
  ('2602854', '#eu7R7kM', '83m*FMpM'),
  ('2601387', 'fRnp874*', 'a6$cQ@2b'),
  ('2601356', 'h&8TJ8gU', '3sV6*S@$'),
  ('2600700', 'e23A2yR*', 'rCV8Y8&D'),
  ('2600754', '$6S5bV2x', 'VnC$7Dfb'),
  ('2602540', 'tv@W5@4W', 'DVt7k4*J'),
  ('2600804', 'R46Ns3#7', 'P8j9$gZB'),
  ('2603832', 'TANQ!e2E', 'KF8U7X@a'),
  ('2601365', 'Z!*p8exH', '&@vzRzw6'),
  ('2602073', '#b7H*acY', '5EtqHB@P'),
  ('2601362', 'tBv$9@2J', 'Bq56e7A@'),
  ('2604051', 'KRErC$!5', 'M6fFEF#Y'),
  ('2601379', '*&E6!#9e', '7d@Z7$h8'),
  ('2602072', '6w#jHGRh', 'Yne$784R'),
  ('2601376', 'nDQ5y&$3', 'FQJaD$76'),
  ('2600803', 'B@3Kc4ky', '3qkcZX#n'),
  ('2601380', 'NrRNh2M&', 'ws$r2JPW'),
  ('2601372', 'Pe4@rHnP', '4tThE4&t'),
  ('2603185', 'zS8uJ@w4', 'C2nuPZ&4'),
  ('2601558', 'wf@jQ8S&', 'pn@RxM3k'),
  ('2601391', 'c6wM*JWF', 'Xn8@J$HM'),
  ('2600704', '55Utv@aZ', '*dwKANw8'),
  ('2601370', '$#7r&WcZ', 'zA&444rq'),
  ('2602493', '@ZY9ed5v', 'dnwc&KA9'),
  ('2601381', '$DuZG6dx', 'W2$YqvZ*'),
  ('2602494', '8fQX#Aav', '9FP5#ju@'),
  ('2602221', '3c#jkKR$', '7!3@uBK#'),
  ('2601364', 'mW@$y9$b', '&RNd5bJN'),
  ('2602233', '*#xDn7s@', 'DVEgWD3$'),
  ('2600753', '*Am45FcP', '#u9KceV9'),
  ('2601382', '8pA#A@dx', 'Dm!Vy&X3'),
  ('2601393', 'R4VGm&zH', '#B2Mx7V5'),
  ('2600430', '7JvHK&Y*', 'H4&HxRd&'),
  ('2601367', 'Huq6@Q4n', 'K5txx*sC'),
  ('2603498', 'J&W6h@w#', '564BT$Ga'),
  ('2600701', '@z!E7k&$', '&BKFaF2D'),
  ('2603607', '&6at$pGK', 'f@K6SfrY'),
  ('2601373', 'dmHNw5V!', '2&kx$5AR'),
  ('2600706', '*twSFN5*', 'Y#G#*9Na'),
  ('2601562', '*ZFN7u9#', 'wg$b5RnG'),
  ('2601394', 'd3ngsU@w', 'z&cu9Wwz'),
  ('2600698', 'VqX5$@sF', 'yU9Kx@v!'),
  ('2600327', '#Ntvt98s', 'Ff$b29hn'),
  ('2600410', 'k8sd7!VU', 'GS*cF8@K'),
  ('2603836', '2TbTF*uj', 'Q7!C39m*'),
  ('2600404', 'R68@gtA6', 'Mq2U!7bx'),
  ('2500856', 'YNZ!57rj', 'fB!vWMz8'),
  ('2603830', '6F3as3m!', 'Y7H5@snR'),
  ('2602071', '7Smyh!Qm', 'cjx*NU5e'),
  ('2601363', '3KfAEMf*', '*8hUzGaZ'),
  ('2602586', 'zVpbHQ&7', 'PDx@2*ZG'),
  ('2603829', 'PYs4WqS&', 'tsD8PTU@'),
  ('2603609', 'KyB$r7@Q', '#k2E&DaW'),
  ('2603834', '9kA&3h&F', 'QnrfxT7$'),
  ('2601374', '!y6yVs4E', 'YV5r$jNU'),
  ('2602857', 'rwaVQ2$A', 'gqn4$kXX'),
  ('2601371', '2m7&@wtB', '&JTe7ew5'),
  ('2603608', 'NZf&h7wB', '@cXX7ZU!'),
  ('2600705', '7gGEX#hY', '&Ahh3G&B'),
  ('2601561', '2pa@8Fh&', '5TZG!Ejg'),
  ('2502880', 'e6zsPb$Q', 'Kk&fcA5t'),
  ('2601390', 'F2ud8fu!', 'MDu&J2Z@'),
  ('2603833', 'n3C5q6*D', '*S*un2MU'),
  ('2601378', 'h9K9N!WT', '#j&2&EA9'),
  ('2602222', 'fP3qu8C!', 'fwz6PX@s'),
  ('2602855', '7J68#2$v', 'fp9#DGPW'),
  ('2600406', 'eT#$Vjy8', 'M@j*8K&g'),
  ('2602258', 'm&b7dkZa', 'Z66Z@nZX'),
  ('2603610', '5d!audDU', 'cCG7NV!f'),
  ('2601368', '@Na$Tcp5', '6W8EaE&Y'),
  ('2602856', '&V3Y@hrk', 'JHQ6g!uA'),
  ('2603831', 'c4Ws$vr4', 'q7cX!ZG4'),
  ('2604052', '!Th8S@y5', 'pf4&TCxE'),
  ('2603835', '4v$TFhY7', 'KmQ@9ay9'),
  ('2601758', 'e&2PbVWe', 'Tc!by5X#'),
  ('2603184', '$zV#2ej5', '6Gf$R$GK'),
  ('2602541', '#5f$2N4$', '3g#BaW!q'),
  ('2601385', 'Q8@4&jbe', 'WH#tC4Yq'),
  ('2601369', 'Xq*2tMq9', 'j9Tz66$k'),
  ('2602259', 'qY$9A3pK', 'p&67@2Yd'),
  ('2602610', 'K79uZ&TA', 'A@7s5E&d'),
  ('2600411', 'D7!TnJx4', 'TUCB&vk6'),
  ('2601355', 'KJ9Y*n2w', '52p#C$!7'),
  ('2603370', '8Ct25e$#', '9dfcE!Za'),
  ('2601384', '*DK3jxcG', 'q2e2EMv$'),
  ('2603297', '!WvEQ@K6', 'v@KjJ6Jx'),
  ('2601360', '#7XQBu5C', 'V7XztuK*'),
  ('2601559', 'GE#92qCX', 'r&h3FtVh'),
  ('2602257', 'e4JbF9*v', 'YXq!KHP2'),
  ('2601361', 'p9$27fPK', 'kn@8Ws53'),
  ('2604050', 'q3HU&v!&', 'FFv5M@x8'),
  ('2502032', '*gH#GuV9', 'gs@J2RdV'),
  ('2600331', '$RG!s5b2', 'D36Rd9W!'),
  ('2601554', 'e7d&tMsD', 'D@r69Ed7'),
  ('2602781', 'aE*b6WkU', 'bZq#ZS65'),
  ('2601757', '&8JPUws9', '64Vfbj&#'),
  ('2603942', '2@XW*bd7', 'Mj7CMjy#'),
  ('2603611', 'cHQhS2f*', 'AmS*gsw2'),
  ('2601389', '&7w3KACr', '9K*xHcSE'),
  ('2602240', 'jQ2sg$M4', 'Y*V8u2ny'),
  ('2601386', 'zuQ6*nYY', '7T!Xd*tK'),
  ('2501739', 'p!j7b7B$', '#z9dPwvE'),
  ('2502623', '3b*$kSjU', '332EM8q@'),
  ('2500834', '!7!ekcG2', '@gWF6$uZ'),
  ('2503301', 'z#&3@UgU', 'Mpk#qFf7'),
  ('2500835', 'guVw7s#U', '#p7DSKHh'),
  ('2503814', '!BfCGU8@', 't2P8q!hQ'),
  ('2502489', '77z#W#cd', 'uTTv#m4&'),
  ('2503522', 'QmTv5U3!', 'vK@P9Wuq'),
  ('2503830', '3f#66sYp', 'Q#$xcPd3'),
  ('2500869', 'x3UZDR$3', '4A3r6G$Z'),
  ('2500860', 'M7B$Gquf', 'UWby@He7'),
  ('2501740', 'e&NEEq6E', '4Hb38u#*'),
  ('2503483', 'g*n5HT*9', '#5K7ny6H'),
  ('2500857', '$6uM#N3f', '$aBn!$3j'),
  ('2501741', 'DAgvJ6&8', '*76&bM!E'),
  ('2502622', 'Mrq9Tm*@', 'n#dCNe4b'),
  ('2500172', 'T3U6f@wU', '@3h4Zf9F'),
  ('2500837', 'QgCq!b79', '@NY6&AFz'),
  ('2500831', 'B4ba7Gq*', '9&Fx@hPx'),
  ('2500865', 'XSmD&4wP', 'xNk96E@5'),
  ('2500833', 'n**u8Jkx', '#@jC44p!'),
  ('2500840', '@*&j7tFA', 'M!8*7hZe'),
  ('2502488', 'k*2XQJs2', 'g2tSNjE@'),
  ('2500839', 'zn8E7K*F', '6Z&t!wbR'),
  ('2500748', 'RkQ*UP3w', 'UPfj4s8#'),
  ('2503485', 'aCUf5&m7', '7J!ndDmG'),
  ('2503303', 'yxz6$6tH', 'ur&6qkRS'),
  ('2500753', '&&&8tmaD', '@@B8jU98'),
  ('2502301', 'Fz*tR77m', '6Gy!uQrM'),
  ('2500858', 'NV2ktg*V', 'RGX3gsM#'),
  ('2501737', '3Q!8ffcU', 'Nehb6!Eq'),
  ('2500850', 'yaAx4*82', 'xAUuZ$32'),
  ('2502624', '!*6Fe7wf', 'AMRQ*xv3'),
  ('2500842', '5rt3##SN', '2p@Bma2a'),
  ('2500828', '62Y4Ak$s', 'r7Udj!jG'),
  ('2500870', 'Q@Zbk3YA', 'd*Y4amr5'),
  ('2503484', '7Y6dNfj*', '6nKrc#V4'),
  ('2500861', 'HmM4!VNc', 'R#B&qs!9'),
  ('2500836', 'yrg!sAP3', 'n*EH5ADf'),
  ('2500868', 'u&4zVrfT', 'ZhJEwc8*'),
  ('2500872', 'KK@kK4A7', 'jH@B$p5v'),
  ('2503486', 'NZh4&ujF', '2gpKFU@p'),
  ('2502878', '$6mKm4@C', 'uk7SPB$C'),
  ('2501736', '*zGCC6ws', 'w$M39Bv$'),
  ('2500854', 'XgAr#Ng6', '*TGewgu8'),
  ('2501738', 'mDFQct6#', 'REvQ$zg3'),
  ('2503482', '@4XnKe4B', 'Z9#hC&Wt'),
  ('2500823', 'Sn4F$!&f', 'BvS3*hqz'),
  ('2500825', '9#CajjuN', '!p!XCg8v'),
  ('2500751', '&9K$62Sc', '@4UgZuxQ'),
  ('2500853', 'kpc&KU6P', 'bF9HS$VZ'),
  ('2500851', 'j!Sz#C9s', 'tV$$!S8F'),
  ('2500848', 'XKW7$r#9', 'GS8N6!mw'),
  ('2501742', 'TZG5GJy$', '8@uZndNE'),
  ('2502340', 'x@dRe7qA', 'V9*eC7K5'),
  ('2503302', '2m#gVBkb', 'szEPZj7&'),
  ('2501745', 'RBn4*yaK', 'UhDuW6!#'),
  ('2501743', 'x6kePj&M', '*Wd49$J@'),
  ('2500874', 'z!QkD!s9', 'V*dSk$P8'),
  ('2500827', 'x@3b9nZM', 'g43qGEU*'),
  ('2503643', 'Zw4wg#4t', '3JmQ&qZa'),
  ('2500844', '@&z7C6Sb', '2qx*hD&A'),
  ('2500353', 'B6!b8n8K', 'G5UZb&j7'),
  ('2500847', 's3eFbG$E', '*VD2jE7J'),
  ('2401888', 'df5yg2$C', '7stF9H&@'),
  ('2502341', 'fgR!a83#', '@ft#8T5c'),
  ('2500859', 'Pg8*U*!D', 'Y@V4TUPh'),
  ('2401664', '!rK4cwzh', 'a&&YtX9W'),
  ('2500846', '$RUP@9x8', '!B3qTjM&'),
  ('2503928', 'Df$24Hcn', 'dSpY8M&5'),
  ('2503697', 'j9*uwR9m', 'Mae!DJN5'),
  ('2500845', '6jVUu2Z&', 'JGu&5$Pr'),
  ('2502299', '#2*9!7zH', 'MKNP$f@4'),
  ('2500830', '$eNb49QJ', 'u5@QzpsF'),
  ('2501770', '#Yzr4d#&', 'vTnQqe7@'),
  ('2500035', 'pK&5jz$H', 'pr!7P6G#'),
  ('2502953', 'EWm8$cPC', 'V$dFJDp2'),
  ('2500077', 'dXS!V98R', 'FS!QE3rs'),
  ('2403470', '74WgseR@', 'w*tW3HUY'),
  ('2403013', '!e$3MHDy', 'y5pnQ&HF'),
  ('2403973', 'x4!fDtKE', 'C5r@7Tk!'),
  ('2403614', 'g!X6rYfs', '9D6Uwh&r'),
  ('2403381', '7PUJ*n$C', 'g$6GDrzf'),
  ('2403097', 'K3Xcj!G4', '#8ggtgZ*'),
  ('2403095', '*4!gxBsS', '@sr898rT'),
  ('2403351', 'GdNVf#@2', 'fsS53@SP'),
  ('2403599', 'sgWHj9T@', '9MW$x2Qp'),
  ('2402659', 'uJ&PkC8q', '&6UQn&tg'),
  ('2402657', '9P@MDubM', 'x5r&B6FM'),
  ('2401665', '#eDN7&K7', 'D2#BmshQ'),
  ('2403431', 'QTkh*8h#', 'c4du*6HR'),
  ('2402524', 'Xp7Qw$9A', 'k$8*5Pxg'),
  ('2402137', 'F2MtX*Yk', 'HCM&W25e'),
  ('2402526', 'tVM7vFq!', 'Gmj37Y*8'),
  ('2401358', 'Ucg!hE3*', 'eX&#3z33'),
  ('2401773', 'pxx*S442', '#Kf4UHxy'),
  ('2401666', 'Qqu!Em6#', 'XE2!uwaF'),
  ('2401997', 'TX5$6jrE', 'FD!4nkKR'),
  ('2200298', 'wF!cZ&S9', 'wy*Fb*G6'),
  ('2403468', 'Xxh3E*5k', '*F$*Ts5j'),
  ('2401359', 'dWG$yq2Z', '3G!Ud$UY'),
  ('2403353', 'e2a*e$Zw', 'xk$#MaK4'),
  ('2402876', '9$jmNDfR', 'NE9#c5&w'),
  ('2401838', 'j!K4jdvK', 'qcT&4t5r'),
  ('2402051', 'm34Tr&6s', 'Q6aeTsa@'),
  ('2403428', '9UUc*Uqk', 'm4bT3!sF'),
  ('2401668', 'z2qSQnU$', 'kPRv&m6G'),
  ('2402138', 'a!yV8KuZ', '#ttnQf2#'),
  ('2401669', 'z7xw7!Rs', 'Md!8CJZZ'),
  ('2402525', 'H3$kK5Ud', 'cRv#ma6K'),
  ('2400753', '$T4Gn*NB', '8&ztxNN@'),
  ('2301657', '#m46Ts7@', 'y48hj&AU'),
  ('2401045', 'EEt8gaf@', '2@p@cSQr'),
  ('2401356', '!byYw2bq', '#Bqr!N4g'),
  ('2401056', '8#m9yVeF', 'ES6qF@g@'),
  ('2400098', 'TP8Z7Y$y', '!n##XVz6'),
  ('2400238', 'bTs@mU4D', '6pMm#v5f'),
  ('2303061', '$PKzEwU3', 'pFXrW@!2'),
  ('2400071', '8&qEsVbR', '&DJUQjx9'),
  ('2400751', '#mQJfd2V', '*eVGt7n*'),
  ('2400915', '6A4&4c!!', 'bM*&5rmE'),
  ('2400754', 'rFP93T@j', 'yua8A9!m'),
  ('2303099', 'vCdG#m4x', '!4D$RDxK'),
  ('2400190', '4&mF7fr@', 'ahXPH*7e'),
  ('2400242', '&A#6M8dY', 'cRaE8#XZ'),
  ('2400752', '7HN!PqzK', 'bg&BQ3DJ'),
  ('2400070', 'TW!!5wv@', 'R*e9NF&R'),
  ('2303198', 'EFpur4x&', 'n&J5c@Th'),
  ('2402873', 'Ft*9J873', '@eJ5FFF7'),
  ('2403259', 'w2cv@tpT', '&5ryK@cQ'),
  ('2302649', '86xn&NTP', '&P*$c9tW'),
  ('2302939', 'cp7$TvDt', 'Y!uNU7*b'),
  ('2303054', 'cvWp63@*', 'DZ$zKmS3'),
  ('2303057', '#S8b9D3D', '3n&PXcjH'),
  ('2303067', '!kjScCH9', '4chYNe7$'),
  ('2301116', 'dygP#x54', 'gvY#8879'),
  ('2301888', 'mAT*s@8G', 'v5f$2#Sr'),
  ('2301232', '2&5jkQhF', 'gYe5qDA$'),
  ('2301660', 'sbQG@2&p', 'htD#w3pX'),
  ('2301659', 'm388WTc*', '4!h$Tx6Q'),
  ('2303069', '&E*A3$@d', 'G*Cb@g7H'),
  ('2302681', 'A3CG7e!$', 'sK#Kf6a9'),
  ('2302431', '2Cy*jdSF', 'r@RBwD7w'),
  ('2302117', 'M$HT6Tup', 'WkAm4C*d'),
  ('2300685', 's4&GGgCc', 'jy2tP*Yv'),
  ('2301467', 'd4D8shr@', 'd#hBw6je'),
  ('2301115', '2FT#eUQp', 'zN2!$En3'),
  ('2301468', 'pxvW6&y@', 'F5qt@gjk'),
  ('2302038', 'hrD$5y&Z', 'U*D2uWNV'),
  ('2303063', '&3nq*!xQ', 'Y3#XMcE3'),
  ('2302115', 'qB6&ryyP', 'Csf99v$p'),
  ('2303076', '6W!jDUug', 'XMr75#H!'),
  ('2301947', 'aKF68jA*', '3w7gAGZ@'),
  ('2301119', '@wzdVN5!', 'gyF7*U6*'),
  ('2301846', 'DfQb3@#q', '2sMEGj!!'),
  ('2303068', 'S66etU*&', '4&QYWtcf'),
  ('2301407', '&U3*fa84', '6w8K6#Yu'),
  ('2300687', 'gzxT8X&w', '3Mu#VwTW'),
  ('2303078', '#Z9vJ2v3', 'b#bB2N#d'),
  ('2303062', '9Se3R*Uu', 'w8RpSBC#'),
  ('2302651', 'd4m#@VS!', '@wJC2Cyz'),
  ('2403354', 'vT3$Zp5R', 's&R77PgE'),
  ('2303158', 'Z4xFdRt&', 'naU#5dbA'),
  ('2200289', 'jG4UN*Pf', 'rFtsb7N&'),
  ('2303077', 'R&4$U!yv', '!c#Safh6'),
  ('2100400', 'E#GWu7mP', 'G&d6BJNx'),
  ('2303072', '!3FpaG9E', 'S#9wn#hq'),
  ('2303213', 'kMDh6@7q', 'Zv#JBCn5'),
  ('2300682', '#HD7grAv', 'zhGRd9&X'),
  ('2302376', 'p8UH#xyq', '7K@PeewT'),
  ('2303064', '*NQ#k53E', '7R@mwwue'),
  ('2300688', 'nW$v9mta', '$UhHk7*9'),
  ('2303075', '9wGx2U$r', '8B@2$5zd'),
  ('2302937', '&Gq3FtwM', '6aJW4$wM'),
  ('2300684', '6cFwg@2z', '7@DF$rTh'),
  ('2303203', 'cz23fXa$', 'fjRA&Hz8'),
  ('2302116', '*f7GxNuv', 'VPv8y*w7'),
  ('2303098', 'Sz@egQM7', '8T@&4Xre'),
  ('2403089', 'PQ&vP93f', '$ABu&2zq'),
  ('2302652', 'vG#!5ec8', 'Z#W7k&AD'),
  ('2200299', 'EZV6dbh$', 'u6Vk!jRH'),
  ('2303211', '2q3*yN@m', 'W@Pf36P4'),
  ('2200470', 'tQzm4s*J', '&kxJg4&G'),
  ('2303066', 'Sk$3nEd!', 'c7tQ7@k$'),
  ('2303159', '5$7*bvGc', 'E2DrQ@HH'),
  ('2300686', '@jTVnP9Q', 'm*9K&dqC'),
  ('2303100', '*#7ESyJf', '5NCkjaQ*'),
  ('2301118', 'x863Pj*k', 'NVb9D6$6'),
  ('2301887', '#q&Qm2PU', 'Et$!6uk*'),
  ('2303058', 'G5!J6jw8', 'p62e*#J3'),
  ('2301120', 'Uu5n*F*E', '*j$bPq5H'),
  ('2302969', 't$9$CdQ3', 'C5dc#JNZ'),
  ('2301658', '!wh6HkZe', 'F&rJPqE3'),
  ('2303162', 'SqB8jBt!', 'xr!FAVW3'),
  ('2401667', 'n&C4nVn8', '7!HnWvmB'),
  ('2400241', '*8$x&4Jc', '6$yW#K8U'),
  ('2303052', 'Z$uqRhd3', 'C!ayY5Gg'),
  ('2403429', 'Z39@!vxR', '@8TmGqSG'),
  ('2400243', 'Brhn#g2s', 'h$rUw&6Y'),
  ('2200297', 'XuZ47@$j', 'y&UkhGY6'),
  ('2403245', 'R@cFtwz3', '&rNHR3zF'),
  ('2202597', 'NCy6!nrW', 'Zhpq4WM!'),
  ('2402841', '@A4aBrDe', 'wA9UhMS@'),
  ('2302940', '7hN@s&W&', '7yP&wdFB'),
  ('2302545', '5f!YrXSt', 'KsXT!MS6'),
  ('2402874', 'k3Q#cvac', 'ub9anTC$'),
  ('2400755', '2#h*N5$E', 'S6u@mkBx'),
  ('2303051', 'wE$5dVVu', 'r6*tk*Zh'),
  ('2403860', 'NAEN7!py', '*aMeX8Uv'),
  ('2303074', 'M&5Feah7', 'jdc#K7ne'),
  ('2402313', '54qr#Vzx', '2&QmGr#Y'),
  ('2303053', 'Y2@hCfta', 'yk&*zD#6'),
  ('2402196', 'AEw@H4Qr', 'G4#4n!DP'),
  ('2403352', 'q*HY6xKj', '*MafWcW2'),
  ('2303160', 'BC!dt37#', 'HYn$BnG8'),
  ('2401360', 'rChU6G&B', 'J$@2RMbn'),
  ('2402875', 'bY8N*8Xj', 'rCNCY$4W'),
  ('2402315', 'am6&8PCW', 'GXENt#6b'),
  ('2302968', 's97u*eDR', 'b7Y3T!j*'),
  ('2401998', 'dD6F5&tb', 'GT3N3@ty'),
  ('2302970', 'qUsM6Wu#', 'FJ3pn@Uu'),
  ('2403111', '2Y!3E3zp', 'Z4#Ahc!Z'),
  ('2101559', 'XX&ZxTb3', 'Rk739!9W'),
  ('2403356', '6vGW!9gF', 'B4GYtT*T'),
  ('2302938', '6AV2@6vf', 'pR6xtc#B'),
  ('2402922', 'Y9bWAj4#', 'K9mqKpx*'),
  ('2200456', 'bGZ8@y8r', 'Ed97*WbV'),
  ('2403469', '4FxPRy!h', '77tA@n49'),
  ('2402751', 'ma*8uQpn', 't$f!DZ34'),
  ('2303050', 'jGv5WZg&', 'H2#cbtfH'),
  ('2402658', '9D@g$8Vd', '7q#FrZqA'),
  ('2303202', 'gd*6hwT7', 'ZE!W&c36'),
  ('2301121', 'd!#CH9nW', '$Gdf#9fb'),
  ('2403254', '*GkF59#8', 'u!5zpUdh')
ON CONFLICT (user_id) DO UPDATE 
SET pdf_password = EXCLUDED.pdf_password,
    excel_password = EXCLUDED.excel_password,
    updated_at = now();

-- Update public.users with the exact printed PDF card passwords (strictly excluding admins)
UPDATE public.users u
SET password = v.pdf_password
FROM public.student_credentials_vault v
WHERE u.user_id = v.user_id 
  AND u.role NOT IN ('admin', 'super_admin');

-- Also ensure any student from the distributed cards that might be missing is inserted
INSERT INTO public.users (user_id, name, password, role)
SELECT v.user_id, 'طالب', v.pdf_password, 'student'
FROM public.student_credentials_vault v
WHERE v.user_id NOT IN (SELECT user_id FROM public.users)
ON CONFLICT (user_id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 4. CLEAN CORRUPTED AUTH ROWS (Fixes: 500 error on sign-in)
-- ------------------------------------------------------------------------------
DELETE FROM auth.identities 
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email LIKE '%@gradely.app'
    AND email NOT LIKE '%amahmoud%' 
    AND email NOT LIKE '%admin%'
);

DELETE FROM auth.users 
WHERE email LIKE '%@gradely.app'
  AND email NOT LIKE '%amahmoud%' 
  AND email NOT LIKE '%admin%' 
  AND id NOT IN (SELECT auth_id FROM public.users WHERE role IN ('admin', 'super_admin'));


-- ------------------------------------------------------------------------------
-- 5. RECREATE verify_legacy_login (BULLETPROOF WITH DUAL PASSWORD SUPPORT)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_legacy_login(text, text);

CREATE OR REPLACE FUNCTION public.verify_legacy_login(p_user_id text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user RECORD;
  v_clean_id text;
  v_clean_pass text;
  v_pass_valid boolean := false;
BEGIN
  v_clean_id := TRIM(COALESCE(p_user_id, ''));
  v_clean_pass := TRIM(COALESCE(p_password, ''));

  IF v_clean_id = '' OR v_clean_pass = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 1. Rate limiting check
  IF EXISTS (
    SELECT 1 FROM public.login_attempts
    WHERE user_id = v_clean_id 
      AND locked_until IS NOT NULL 
      AND locked_until > now()
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'تم تجاوز عدد محاولات الدخول الخاطئة المسموحة. يرجى الانتظار 15 دقيقة.'
    );
  END IF;

  -- 2. Fetch user record
  SELECT id, user_id, name, role, password, encrypted_password, year_level, section, assigned_subjects, auth_id, last_sign_in_at
  INTO v_user
  FROM public.users
  WHERE user_id = v_clean_id 
     OR (
       v_clean_id ILIKE '%20262027217%' AND user_id ILIKE '%20262027217%'
     )
  LIMIT 1;

  IF v_user IS NULL THEN
    BEGIN
      INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
      VALUES (v_clean_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE 
      SET attempts = public.login_attempts.attempts + 1,
          last_attempt = now(),
          locked_until = CASE WHEN public.login_attempts.attempts + 1 >= 10 THEN now() + interval '15 minutes' ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 3. Password matching:
  -- A. Match against users.password (which is now the printed PDF card password!)
  IF v_user.password IS NOT NULL AND (
     v_user.password = p_password 
     OR v_user.password = v_clean_pass
     OR TRIM(v_user.password) = v_clean_pass
  ) THEN
    v_pass_valid := true;
  END IF;

  -- B. Match against student_credentials_vault (covers both printed PDF and Excel passwords)
  IF NOT v_pass_valid THEN
    IF EXISTS (
      SELECT 1 FROM public.student_credentials_vault
      WHERE user_id = v_clean_id AND (
        pdf_password IN (p_password, v_clean_pass)
        OR excel_password IN (p_password, v_clean_pass)
      )
    ) THEN
      v_pass_valid := true;
    END IF;
  END IF;

  -- C. Special support for student 2302968 (s97u*eDR or b7Y3T!j*)
  IF NOT v_pass_valid AND v_user.user_id = '2302968' AND (
     p_password IN ('s97u*eDR', 'b7Y3T!j*') 
     OR v_clean_pass IN ('s97u*eDR', 'b7Y3T!j*')
  ) THEN
    v_pass_valid := true;
  END IF;

  -- D. Special support for student 2402313 (54qr#Vzx or 2&QmGr#Y)
  IF NOT v_pass_valid AND v_user.user_id = '2402313' AND (
     p_password IN ('54qr#Vzx', '2&QmGr#Y') 
     OR v_clean_pass IN ('54qr#Vzx', '2&QmGr#Y')
  ) THEN
    v_pass_valid := true;
  END IF;

  -- E. Match encrypted bcrypt hash if present (in case student changed password)
  IF NOT v_pass_valid AND v_user.encrypted_password IS NOT NULL THEN
    BEGIN
      IF extensions.crypt(p_password, v_user.encrypted_password) = v_user.encrypted_password
         OR extensions.crypt(v_clean_pass, v_user.encrypted_password) = v_user.encrypted_password THEN
        v_pass_valid := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- 4. Result evaluation
  IF v_pass_valid THEN
    -- Clear failed attempts
    BEGIN
      DELETE FROM public.login_attempts WHERE user_id = v_clean_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Record last sign in timestamp
    BEGIN
      UPDATE public.users 
      SET last_sign_in_at = now() 
      WHERE id = v_user.id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object(
      'success', true,
      'user_id', v_user.user_id,
      'name', v_user.name,
      'role', v_user.role,
      'year_level', v_user.year_level,
      'section', v_user.section,
      'assigned_subjects', v_user.assigned_subjects,
      'auth_id', v_user.auth_id,
      'last_sign_in_at', now()
    );
  ELSE
    BEGIN
      INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
      VALUES (v_clean_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE 
      SET attempts = public.login_attempts.attempts + 1,
          last_attempt = now(),
          locked_until = CASE WHEN public.login_attempts.attempts + 1 >= 10 THEN now() + interval '15 minutes' ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_legacy_login(text, text) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6. GRANT FULL PERMISSIONS FOR STUDENT DASHBOARD
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.subjects TO anon, authenticated;
GRANT SELECT ON public.attendance TO anon, authenticated;
GRANT SELECT ON public.grades TO anon, authenticated;
GRANT SELECT (id, user_id, name, role, year_level, section, assigned_subjects, last_sign_in_at, auth_id, created_at) ON public.users TO anon, authenticated;

DROP POLICY IF EXISTS "Allow anon read subjects" ON public.subjects;
CREATE POLICY "Allow anon read subjects" ON public.subjects FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance;
CREATE POLICY "Allow anon read attendance" ON public.attendance FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read grades" ON public.grades;
CREATE POLICY "Allow anon read grades" ON public.grades FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read admin directory" ON public.users;
CREATE POLICY "Allow anon read admin directory" ON public.users FOR SELECT TO anon USING (role IN ('admin', 'super_admin'));


-- ------------------------------------------------------------------------------
-- 7. AUDIT LOGS PERMANENT SANITIZATION (ZERO PASSWORD LEAKAGE)
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO postgres, service_role;

UPDATE public.audit_logs
SET old_data = old_data - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token',
    new_data = new_data - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token'
WHERE old_data ? 'password' OR new_data ? 'password' 
   OR old_data ? 'encrypted_password' OR new_data ? 'encrypted_password';

CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_auth_id uuid;
  v_actor_user_id text;
  v_rec_id text;
  v_old_data jsonb;
  v_new_data jsonb;
BEGIN
  v_actor_auth_id := auth.uid();
  
  IF v_actor_auth_id IS NOT NULL THEN
    SELECT user_id INTO v_actor_user_id FROM public.users WHERE auth_id = v_actor_auth_id LIMIT 1;
  END IF;

  IF (TG_TABLE_NAME = 'users') THEN
    IF (TG_OP IN ('UPDATE', 'DELETE')) THEN
      v_old_data := to_jsonb(OLD) - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token';
    END IF;
    IF (TG_OP IN ('UPDATE', 'INSERT')) THEN
      v_new_data := to_jsonb(NEW) - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token';
    END IF;
  ELSE
    IF (TG_OP IN ('UPDATE', 'DELETE')) THEN
      v_old_data := to_jsonb(OLD);
    END IF;
    IF (TG_OP IN ('UPDATE', 'INSERT')) THEN
      v_new_data := to_jsonb(NEW);
    END IF;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_rec_id := COALESCE(OLD.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'DELETE', TG_TABLE_NAME, v_rec_id, v_old_data);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'UPDATE', TG_TABLE_NAME, v_rec_id, v_old_data, v_new_data);
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'INSERT', TG_TABLE_NAME, v_rec_id, v_new_data);
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;


-- ------------------------------------------------------------------------------
-- 8. SECURITY SETTINGS & 2FA BACKEND (GOOGLE AUTHENTICATOR / BACKUP PIN)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_settings FROM anon, authenticated, public;
GRANT ALL ON public.security_settings TO postgres, service_role;

INSERT INTO public.security_settings (key, value)
VALUES 
  ('admin_totp_secret', 'JBSWY3DPEHPK3PXP'),
  ('admin_promotion_pin', '2026217')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_super_admin_2fa(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_pin text;
BEGIN
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RETURN false;
  END IF;

  SELECT value INTO v_stored_pin FROM public.security_settings WHERE key = 'admin_promotion_pin';
  IF v_stored_pin IS NOT NULL AND v_stored_pin = TRIM(p_code) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin_2fa(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_super_admin_2fa_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_pin text;
BEGIN
  SELECT value INTO v_secret FROM public.security_settings WHERE key = 'admin_totp_secret';
  SELECT value INTO v_pin FROM public.security_settings WHERE key = 'admin_promotion_pin';

  RETURN jsonb_build_object(
    'totp_secret', COALESCE(v_secret, 'JBSWY3DPEHPK3PXP'),
    'backup_pin', COALESCE(v_pin, '2026217')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_2fa_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_super_admin_2fa_config(p_secret text, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_secret IS NOT NULL AND TRIM(p_secret) <> '' THEN
    INSERT INTO public.security_settings (key, value, updated_at)
    VALUES ('admin_totp_secret', TRIM(p_secret), now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  IF p_pin IS NOT NULL AND TRIM(p_pin) <> '' THEN
    INSERT INTO public.security_settings (key, value, updated_at)
    VALUES ('admin_promotion_pin', TRIM(p_pin), now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_super_admin_2fa_config(text, text) TO authenticated;
