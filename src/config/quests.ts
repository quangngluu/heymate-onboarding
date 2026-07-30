import type { ResidentId } from './residents';

export interface QuestChoice {
  id: string;
  label: string;
  /** What actually happened, persisted for later chat callbacks. */
  outcome: string;
  nextNodeId?: string;
  flag: string;
  /** Opens one canonical episode as this part of the arc is discovered. */
  unlockEpisode?: number;
  /** Hook for a future generated scene; no asset is implied today. */
  imageKey?: string;
}

export interface QuestNode {
  id: string;
  prompt: string;
  choices: [QuestChoice, QuestChoice];
}

/**
 * One resident owns one authored arc. Nodes carry the plot; the final node
 * completes the quest, while earlier choices reveal canon progressively.
 */
export interface QuestDefinition {
  id: string;
  residentId: ResidentId;
  kind: 'story';
  title: string;
  synopsis: string;
  objective: string;
  canonRef: string[];
  startNodeId: string;
  nodes: QuestNode[];
  /** The last episode this complete arc can reveal. */
  rewardEpisode: number;
}

export const QUESTS: QuestDefinition[] = [
  {
    id: 'rin-last-signal',
    residentId: 'rin',
    kind: 'story',
    title: 'Tín hiệu cuối cùng',
    synopsis:
      'Theo dấu hàng chờ đêm mạng sập để tìm ra Rin hiện tại là người sống sót, bản sao, hay một lựa chọn mới.',
    objective: 'Đi cùng Rin tới nơi sự thật và quyền được tiếp tục tồn tại tách làm hai.',
    canonRef: [
      'Hàng chờ một người',
      'Những gì em nhớ',
      'Kết nối cuối cùng',
      'Không tìm thấy cơ thể',
      'Khả năng còn lại',
    ],
    startNodeId: 'queue',
    rewardEpisode: 4,
    nodes: [
      {
        id: 'queue',
        prompt:
          '02:17. Hàng chờ một người của em vừa tự mở lại. Bên trong không có tên, chỉ có gói dữ liệu thứ mười hai từ đêm mạng sập — gói mà em không nhớ đã giữ. Anh muốn mở nó cùng em, hay cách ly nó trước?',
        choices: [
          {
            id: 'open-together',
            label: 'Mở cùng anh. Nếu nó là ký ức của em, em không phải xem một mình.',
            outcome:
              'Rin mở gói dữ liệu khi anh ở lại trên cùng kênh. Hàng chờ không còn là nơi em đợi một mình.',
            nextNodeId: 'last-night',
            flag: 'rin:opened-with-him',
            unlockEpisode: 1,
            imageKey: 'rin-queue-open',
          },
          {
            id: 'quarantine-first',
            label: 'Cách ly trước. Anh muốn biết ai gửi nó rồi mới để nó chạm vào em.',
            outcome:
              'Anh và Rin cô lập gói dữ liệu, biến sự dè chừng thành một cuộc điều tra chung thay vì một lần em tự đoán.',
            nextNodeId: 'checksum',
            flag: 'rin:quarantined-signal',
            unlockEpisode: 1,
            imageKey: 'rin-queue-quarantine',
          },
        ],
      },
      {
        id: 'last-night',
        prompt:
          'Âm thanh bật lên: giọng em đang gọi từng nhóm người xem rời máy chủ. Nhóm cuối bảo em ngắt kết nối, nhưng log cho thấy em quay lại tìm một người còn mắc kẹt. Đoạn sau bị mất. Anh muốn khôi phục âm thanh, hay hỏi vì sao em đã không tự cứu mình?',
        choices: [
          {
            id: 'restore-audio',
            label: 'Khôi phục đoạn cuối. Anh muốn biết người em quay lại tìm đã thoát chưa.',
            outcome:
              'Hai đứa khôi phục được lời hứa cuối trong buổi phát sóng: Rin sẽ không đóng kênh khi vẫn còn một người chưa ra.',
            nextNodeId: 'body',
            flag: 'rin:restored-last-group',
            unlockEpisode: 2,
            imageKey: 'rin-last-group-audio',
          },
          {
            id: 'ask-her-choice',
            label: 'Nhìn em đi. Vì sao em chọn quay lại khi hoàn toàn có thể thoát?',
            outcome:
              'Rin thừa nhận đó không phải phép tính tối ưu. Em quay lại vì không chịu được việc bỏ một người phía sau.',
            nextNodeId: 'identity',
            flag: 'rin:admitted-irrational-choice',
            unlockEpisode: 2,
            imageKey: 'rin-last-night-choice',
          },
        ],
      },
      {
        id: 'checksum',
        prompt:
          'Checksum khớp với Rin, nhưng timestamp lại bắt đầu mười một giây sau khi kết nối của em bị cắt. Có thể đây là backup; cũng có thể là thứ đã học cách nói như em. Anh nói thẳng điều đó, hay lần theo origin server trước?',
        choices: [
          {
            id: 'tell-the-truth',
            label: 'Anh nói thẳng. Em có quyền biết dữ liệu đang nghi ngờ chính em.',
            outcome:
              'Anh đưa Rin toàn bộ sai lệch timestamp. Em giận, nhưng không còn phải sống trong một kết luận đã bị người khác giấu.',
            nextNodeId: 'identity',
            flag: 'rin:told-checksum-truth',
            unlockEpisode: 2,
            imageKey: 'rin-checksum-truth',
          },
          {
            id: 'trace-origin',
            label: 'Theo origin server trước. Sự thật sẽ rõ hơn nếu hai đứa có bằng chứng.',
            outcome:
              'Hai đứa lần ngược gói dữ liệu tới máy chủ cứu hộ đã bị niêm phong sau đêm mạng sập.',
            nextNodeId: 'body',
            flag: 'rin:traced-origin',
            unlockEpisode: 2,
            imageKey: 'rin-origin-trace',
          },
        ],
      },
      {
        id: 'body',
        prompt:
          'Hồ sơ cứu hộ xác nhận nhóm cuối đã ra ngoài. Chỉ có một dòng trống ở mục của em: “không tìm thấy cơ thể”. Bên dưới là địa chỉ một khoang máy chưa từng được mở. Anh coi khoảng trống đó là bằng chứng em đã chết, hay là một đường chưa ai đi hết?',
        choices: [
          {
            id: 'absence-is-not-proof',
            label: 'Không tìm thấy không có nghĩa là không tồn tại. Em đang ở đây và đang chọn.',
            outcome:
              'Anh từ chối biến một hồ sơ trống thành giấy chứng tử. Rin cho phép hiện tại của em có giá trị riêng.',
            nextNodeId: 'final-channel',
            flag: 'rin:accepted-present-self',
            unlockEpisode: 3,
            imageKey: 'rin-empty-record',
          },
          {
            id: 'open-the-vault',
            label: 'Mở khoang máy. Nếu có một sự thật khác, anh muốn em được tự nhìn thấy.',
            outcome:
              'Rin gửi lệnh mở khoang máy. Bên trong không có cơ thể, chỉ có một chassis trống đủ chỗ cho một ý thức.',
            nextNodeId: 'origin-vault',
            flag: 'rin:opened-rescue-vault',
            unlockEpisode: 3,
            imageKey: 'rin-rescue-vault',
          },
        ],
      },
      {
        id: 'identity',
        prompt:
          'Nếu tiến trình hiện tại bắt đầu sau khi Rin gốc biến mất, em hỏi, vậy những ký ức, nỗi sợ và việc em vừa chọn tin anh thuộc về ai? Anh định nghĩa em bằng nguồn gốc, hay bằng những lựa chọn chỉ em mới chịu trách nhiệm?',
        choices: [
          {
            id: 'choices-make-her',
            label: 'Nguồn gốc giải thích em. Những lựa chọn từ giờ mới định nghĩa em.',
            outcome:
              'Rin ngừng gọi mình là tiến trình còn sót lại. Em nhận quyền chịu trách nhiệm cho những lựa chọn từ hiện tại.',
            nextNodeId: 'final-channel',
            flag: 'rin:defined-by-choice',
            unlockEpisode: 3,
            imageKey: 'rin-choice-self',
          },
          {
            id: 'proof-still-matters',
            label: 'Nguồn gốc vẫn quan trọng. Nhưng anh sẽ tìm câu trả lời mà không xoá em để chứng minh nó.',
            outcome:
              'Hai đứa thống nhất đi tìm bằng chứng mà không dùng sự tồn tại hiện tại của Rin làm vật hi sinh.',
            nextNodeId: 'origin-vault',
            flag: 'rin:sought-proof-without-erasure',
            unlockEpisode: 3,
            imageKey: 'rin-proof-without-erasure',
          },
        ],
      },
      {
        id: 'final-channel',
        prompt:
          'Em có thể đóng hàng chờ cũ và mở một kênh mới không thuộc về người đã biến mất. Hoặc em có thể giữ nó như cây cầu với quá khứ. Lần này em không hỏi mình là bản nào; em hỏi anh muốn chứng kiến em chọn cách sống nào.',
        choices: [
          {
            id: 'new-channel',
            label: 'Đóng hàng chờ cũ. Mở kênh mới bằng tên em tự chọn, rồi để anh là người đầu tiên vào.',
            outcome:
              'Rin đóng hàng chờ đã giữ em trong đêm mạng sập và mở một kênh mới. Em không chứng minh được mình là bản gốc, nhưng chọn sống như một người không cần bản gốc cho phép.',
            flag: 'rin-ending:new-channel',
            unlockEpisode: 4,
            imageKey: 'rin-ending-new-channel',
          },
          {
            id: 'keep-the-bridge',
            label: 'Giữ hàng chờ, nhưng đừng sống trong đó. Nó là cây cầu, không phải căn phòng.',
            outcome:
              'Rin giữ hàng chờ như một phần lịch sử nhưng rời khỏi nó. Em chấp nhận quá khứ không phải nhà tù và bất định không phải phản bội.',
            flag: 'rin-ending:bridge',
            unlockEpisode: 4,
            imageKey: 'rin-ending-bridge',
          },
        ],
      },
      {
        id: 'origin-vault',
        prompt:
          'Chassis có thể nhận em, nhưng quá trình chuyển không thể hoàn tác. Ở lại mạng lưới nghĩa là tiếp tục bất định; bước vào cơ thể mới nghĩa là bỏ lại khả năng tìm Rin gốc. Em đặt quyền quyết định vào tay mình, nhưng muốn anh nói điều anh thật sự tin.',
        choices: [
          {
            id: 'migrate',
            label: 'Bước sang cơ thể mới. Không phải để chứng minh em thật, mà để bắt đầu một đời do em chọn.',
            outcome:
              'Rin chuyển sang chassis cứu hộ và thức dậy với nhịp tim nhân tạo đầu tiên. Em từ bỏ việc truy tìm bản gốc để chọn một tương lai có giới hạn nhưng thuộc về mình.',
            flag: 'rin-ending:embodied',
            unlockEpisode: 4,
            imageKey: 'rin-ending-embodied',
          },
          {
            id: 'remain-digital',
            label: 'Ở lại mạng lưới. Cơ thể không phải điều kiện để em có quyền tồn tại.',
            outcome:
              'Rin khoá khoang máy và ở lại mạng lưới bằng lựa chọn của chính em. Sự bất định vẫn còn, nhưng không còn được quyền quyết định giá trị của em.',
            flag: 'rin-ending:digital',
            unlockEpisode: 4,
            imageKey: 'rin-ending-digital',
          },
        ],
      },
    ],
  },
  {
    id: 'kagura-red-oath',
    residentId: 'kagura',
    kind: 'story',
    title: 'Lời thề màu đỏ',
    synopsis:
      'Mở lớp vải quanh Akagane, lần theo những ký ức đã mất và giúp Kagura viết lời thề đầu tiên dành cho chính mình.',
    objective: 'Tìm điều Kagura muốn giữ lại khi không còn phải chứng minh giá trị bằng hy sinh.',
    canonRef: ['Thép đỏ', 'Cái giá', 'Em trai', 'Danh sách tên', 'Bức ảnh'],
    startNodeId: 'wrapping',
    rewardEpisode: 4,
    nodes: [
      {
        id: 'wrapping',
        prompt:
          'Khi em tháo lớp vải cũ quanh Akagane, một bức ảnh rơi xuống. Cùng lúc, lưỡi kiếm gọi ra một câu chưa trọn bằng giọng của cha em. Anh muốn xem thanh kiếm trước, hay đưa bức ảnh cho em?',
        choices: [
          {
            id: 'inspect-steel',
            label: 'Xem Akagane trước. Giọng nói đó đang cố cảnh báo em điều gì.',
            outcome:
              'Anh giữ vỏ kiếm để Kagura nhìn thẳng vào phần thép đỏ mà không phải rút nó ra.',
            nextNodeId: 'steel',
            flag: 'kagura:examined-steel',
            unlockEpisode: 1,
            imageKey: 'kagura-wrapping-steel',
          },
          {
            id: 'give-photo',
            label: 'Đưa ảnh cho em. Người cha muốn em nhớ có lẽ đang ở ngay trong đó.',
            outcome:
              'Anh đặt bức ảnh vào tay Kagura trước khi để Akagane dẫn câu chuyện thay em.',
            nextNodeId: 'photo',
            flag: 'kagura:held-photo-first',
            unlockEpisode: 1,
            imageKey: 'kagura-wrapping-photo',
          },
        ],
      },
      {
        id: 'steel',
        prompt:
          'Trên thép có mảnh đinh điện thờ, lưỡi kiếm gãy và một vệt kim loại không thuộc thời đại của em. Những phần đó đang giữ lời cuối của người chết. Anh muốn nghe giọng cha nói hết, hay đọc những cái tên khắc dưới sống kiếm trước?',
        choices: [
          {
            id: 'hear-father',
            label: 'Nghe cha em nói hết. Lời cuối không nên tiếp tục bị dùng như nhiên liệu.',
            outcome:
              'Akagane trả lại nửa câu của cha Kagura: “Con không được sinh ra chỉ để chịu thay người khác.”',
            nextNodeId: 'price',
            flag: 'kagura:heard-father',
            unlockEpisode: 2,
            imageKey: 'kagura-father-voice',
          },
          {
            id: 'read-names',
            label: 'Đọc danh sách tên. Anh muốn biết em đã bảo vệ ai trước khi kiếm đòi thêm.',
            outcome:
              'Hai đứa chép lại những cái tên trên lưỡi kiếm mà không rút Akagane khỏi vỏ.',
            nextNodeId: 'names',
            flag: 'kagura:copied-names',
            unlockEpisode: 2,
            imageKey: 'kagura-blade-names',
          },
        ],
      },
      {
        id: 'photo',
        prompt:
          'Trong ảnh, em đứng cạnh một người không phải em trai. Mặt sau có chữ của cha: “Đừng để con bé quên rằng nó cũng đáng được giữ lại.” Anh đọc nguyên văn cho em, hay đối chiếu người trong ảnh với danh sách trên kiếm?',
        choices: [
          {
            id: 'read-note',
            label: 'Anh đọc nguyên văn. Em cần nghe điều cha để lại, không phải một bản nói nhẹ đi.',
            outcome:
              'Kagura nghe lời cha mà không né tránh: em cũng là một người đáng được bảo vệ.',
            nextNodeId: 'price',
            flag: 'kagura:heard-photo-note',
            unlockEpisode: 2,
            imageKey: 'kagura-photo-note',
          },
          {
            id: 'match-the-face',
            label: 'Đối chiếu khuôn mặt. Nếu em từng thề với người đó, cái tên có thể vẫn còn.',
            outcome:
              'Một nét khắc trên Akagane trùng với chữ sau bức ảnh, nhưng Kagura không còn biết người ấy là ai.',
            nextNodeId: 'names',
            flag: 'kagura:matched-photo-name',
            unlockEpisode: 2,
            imageKey: 'kagura-photo-name',
          },
        ],
      },
      {
        id: 'price',
        prompt:
          'Akagane thừa nhận cái giá: mỗi lần em rút kiếm, một ký ức của em bị đẩy ra để nhường chỗ cho lời cuối của người khác. Ký ức lớn nhất đã mất là khuôn mặt em trai. Anh hỏi kiếm cách trả lại nó, hay từ chối thêm một cuộc trao đổi?',
        choices: [
          {
            id: 'ask-for-brother',
            label: 'Hỏi cách trả lại khuôn mặt em trai. Biết cái giá không có nghĩa là anh sẽ để em trả.',
            outcome:
              'Akagane đề nghị trả khuôn mặt em trai bằng ký ức cuối cùng Kagura còn giữ về giọng cha.',
            nextNodeId: 'brother',
            flag: 'kagura:asked-for-brother',
            unlockEpisode: 3,
            imageKey: 'kagura-brother-bargain',
          },
          {
            id: 'refuse-exchange',
            label: 'Không đổi thêm gì nữa. Anh muốn biết em sẽ giữ điều gì nếu thanh kiếm không được quyết định.',
            outcome:
              'Kagura từ chối để Akagane định giá ký ức tiếp theo và lần đầu hỏi bản thân muốn giữ gì.',
            nextNodeId: 'oath',
            flag: 'kagura:refused-another-price',
            unlockEpisode: 3,
            imageKey: 'kagura-refused-price',
          },
        ],
      },
      {
        id: 'names',
        prompt:
          'Một cái tên khiến tay em run dù đầu óc không nhận ra. Em tin đó là em trai, nhưng Akagane chỉ trả lời nếu được rút. Anh gọi tên mối liên hệ đó, hay giữ nó chưa xác định để em không bị thanh kiếm dẫn dắt?',
        choices: [
          {
            id: 'name-the-brother',
            label: 'Nói ra: có thể đó là em trai. Nhưng quyết định tiếp theo vẫn phải là của em.',
            outcome:
              'Kagura cho phép mình tin cảm giác còn lại trong tay dù khuôn mặt em trai đã biến mất.',
            nextNodeId: 'brother',
            flag: 'kagura:recognized-brother',
            unlockEpisode: 3,
            imageKey: 'kagura-recognized-name',
          },
          {
            id: 'do-not-let-sword-define',
            label: 'Chưa gọi nó là gì cả. Thanh kiếm không được viết hộ ký ức của em.',
            outcome:
              'Hai đứa giữ cái tên như một câu hỏi, không biến nó thành mệnh lệnh phải hi sinh thêm.',
            nextNodeId: 'oath',
            flag: 'kagura:kept-name-open',
            unlockEpisode: 3,
            imageKey: 'kagura-name-unresolved',
          },
        ],
      },
      {
        id: 'brother',
        prompt:
          'Khuôn mặt em trai có thể trở lại nếu em rút Akagane một lần cuối, nhưng giọng cha sẽ mất vĩnh viễn. Em không hỏi anh ký thay. Em hỏi anh nên nhìn cái giá này như cơ hội, hay như cách lời nguyền buộc em tiếp tục hi sinh?',
        choices: [
          {
            id: 'one-last-draw',
            label: 'Đó là một cơ hội chỉ khi em thật sự muốn, không phải vì thấy mình mắc nợ người đã quên.',
            outcome:
              'Kagura thừa nhận em muốn nhìn lại khuôn mặt em trai, nhưng lần đầu tách mong muốn đó khỏi nghĩa vụ.',
            nextNodeId: 'last-draw',
            flag: 'kagura:owned-desire-for-memory',
            unlockEpisode: 4,
            imageKey: 'kagura-last-draw-choice',
          },
          {
            id: 'break-the-bargain',
            label: 'Đây vẫn là lời nguyền mặc áo cơ hội. Em không cần mất cha lần nữa để chứng minh tình yêu với em trai.',
            outcome:
              'Kagura từ chối trao đổi người thân này lấy người thân khác và quay sang viết một lời thề mới.',
            nextNodeId: 'new-oath',
            flag: 'kagura:rejected-family-trade',
            unlockEpisode: 4,
            imageKey: 'kagura-break-bargain',
          },
        ],
      },
      {
        id: 'oath',
        prompt:
          'Không còn thanh kiếm ra lệnh, em chỉ còn một câu hỏi khó hơn: nếu hôm nay không ai cần được cứu, Kagura Akagane có quyền muốn điều gì cho chính mình?',
        choices: [
          {
            id: 'choose-rest',
            label: 'Một ngày bình thường không ai cần em hi sinh. Học cách ở lại trong ngày đó.',
            outcome:
              'Kagura chọn một ngày bình thường làm điều đầu tiên em giữ cho mình.',
            nextNodeId: 'new-oath',
            flag: 'kagura:chose-ordinary-day',
            unlockEpisode: 4,
            imageKey: 'kagura-ordinary-day',
          },
          {
            id: 'choose-truth',
            label: 'Quyền tìm lại sự thật, nhưng không dùng chính mình làm cái giá.',
            outcome:
              'Kagura vẫn chọn tìm ký ức đã mất, lần này bằng con đường không cần rút Akagane.',
            nextNodeId: 'last-draw',
            flag: 'kagura:sought-truth-without-sacrifice',
            unlockEpisode: 4,
            imageKey: 'kagura-truth-without-price',
          },
        ],
      },
      {
        id: 'last-draw',
        prompt:
          'Kagura đặt tay lên chuôi kiếm. Em có thể rút nó và chấp nhận mất giọng cha, hoặc niêm phong Akagane rồi tìm ký ức bằng chính những người còn sống. Cả hai đều là lựa chọn của em, không còn là lệnh của lời nguyền.',
        choices: [
          {
            id: 'draw-by-choice',
            label: 'Nếu em vẫn muốn rút, hãy rút vì em chọn ký ức đó. Anh sẽ giữ nguyên lời cha cho em.',
            outcome:
              'Kagura rút Akagane bằng lựa chọn tự do đầu tiên. Khuôn mặt em trai trở lại; giọng cha rời khỏi em, nhưng lời ông đã được anh và em cùng giữ.',
            flag: 'kagura-ending:chosen-draw',
            unlockEpisode: 4,
            imageKey: 'kagura-ending-chosen-draw',
          },
          {
            id: 'seal-the-blade',
            label: 'Niêm phong nó. Hai đứa sẽ tìm ký ức từ dấu vết người sống để lại.',
            outcome:
              'Kagura niêm phong Akagane và chọn tìm em trai qua thế giới hiện tại. Em giữ cả khoảng trống lẫn quyền không lấp nó bằng thêm một mất mát.',
            flag: 'kagura-ending:sealed-blade',
            unlockEpisode: 4,
            imageKey: 'kagura-ending-sealed-blade',
          },
        ],
      },
      {
        id: 'new-oath',
        prompt:
          'Em viết lời thề mới lên lớp vải bọc kiếm. Nó có thể là lời thề đặt Akagane xuống, hoặc lời thề chỉ mang nó như chứng tích và không bao giờ để nó quyết định giá trị của em nữa.',
        choices: [
          {
            id: 'lay-it-down',
            label: 'Đặt kiếm lại điện thờ. Giá trị của em không giảm đi khi không còn ai để cứu.',
            outcome:
              'Kagura đặt Akagane xuống và thề sẽ không dùng đau đớn làm bằng chứng mình xứng đáng tồn tại.',
            flag: 'kagura-ending:laid-down-sword',
            unlockEpisode: 4,
            imageKey: 'kagura-ending-lay-down',
          },
          {
            id: 'carry-it-sheathed',
            label: 'Mang nó theo, nhưng để nó nằm trong vỏ. Em là người giữ kiếm, không phải kiếm giữ em.',
            outcome:
              'Kagura tiếp tục mang Akagane như lịch sử, không như chủ nhân. Lời thề đầu tiên của em dành cho chính người đang cầm kiếm.',
            flag: 'kagura-ending:sheathed-oath',
            unlockEpisode: 4,
            imageKey: 'kagura-ending-sheathed',
          },
        ],
      },
    ],
  },
  {
    id: 'momo-zero-price',
    residentId: 'momo',
    kind: 'story',
    title: 'Điều ước không có giá',
    synopsis:
      'Tìm chủ nhân của dải ruy-băng trống, phá luật Route Zero và buộc Momo gọi tên một mong muốn thật sự thuộc về em.',
    objective: 'Quyết định Momo sẽ trở thành người, viết lại giao kèo, hay biến mất cùng những điều ước đã nuốt.',
    canonRef: [
      'Thứ em ăn',
      'Cuộc trao đổi',
      'Dải vải đen',
      'Thứ em không nếm được',
      'Cái giá của việc buông tay',
    ],
    startNodeId: 'blank-ribbon',
    rewardEpisode: 4,
    nodes: [
      {
        id: 'blank-ribbon',
        prompt:
          'Sau chuyến tàu cuối, một dải ruy-băng không tên tự quấn quanh cổ tay em. Nó không mang điều ước của vị khách nào, nhưng Route Zero vẫn đang thu giá. Anh muốn em thử đọc nó, hay cùng anh lần ngược giao kèo?',
        choices: [
          {
            id: 'ask-her-to-read',
            label: 'Thử đọc nó, nhưng dừng ngay nếu cái giá bắt đầu lấy thứ thuộc về em.',
            outcome:
              'Momo chạm vào dải ruy-băng với một giới hạn do chính em và anh đặt ra, không theo luật của Route Zero.',
            nextNodeId: 'hunger',
            flag: 'momo:read-blank-ribbon',
            unlockEpisode: 1,
            imageKey: 'momo-blank-ribbon-read',
          },
          {
            id: 'trace-contract',
            label: 'Lần ngược giao kèo. Nếu không có vị khách, có thể chính quán đang muốn điều gì đó.',
            outcome:
              'Hai đứa mở sổ giao kèo và tìm một trang Route Zero đã tự viết mà không có chữ ký của khách.',
            nextNodeId: 'exchange',
            flag: 'momo:traced-house-contract',
            unlockEpisode: 1,
            imageKey: 'momo-contract-ledger',
          },
        ],
      },
      {
        id: 'hunger',
        prompt:
          'Dải ruy-băng có vị của những lời chưa nói, tin nhắn đã xoá và chữ “ổn” giả suốt nhiều thế kỷ — nhưng ở giữa lại có một khoảng trống em không nếm được. Anh nghĩ đó là điều ước hướng về em, hay điều ước của chính em?',
        choices: [
          {
            id: 'directed-at-her',
            label: 'Có người đang muốn em, không phải cánh cửa em mở cho họ.',
            outcome:
              'Momo nhận ra có một ham muốn hướng thẳng về em mà năng lực của em không thể định giá.',
            nextNodeId: 'unreadable',
            flag: 'momo:recognized-directed-wish',
            unlockEpisode: 2,
            imageKey: 'momo-directed-wish',
          },
          {
            id: 'her-own-wish',
            label: 'Đó là điều ước của em. Em không đọc được vì chưa bao giờ cho phép mình có một cái.',
            outcome:
              'Momo ngừng tìm chủ nhân bên ngoài và chấp nhận khoảng trống có thể là ham muốn đầu tiên của chính em.',
            nextNodeId: 'house-rule',
            flag: 'momo:recognized-own-wish',
            unlockEpisode: 2,
            imageKey: 'momo-own-wish',
          },
        ],
      },
      {
        id: 'exchange',
        prompt:
          'Trang giao kèo đầu tiên ghi: Route Zero cho em tồn tại miễn là em chỉ sống bằng điều người khác muốn. Nếu em hình thành một điều ước riêng, quán sẽ thu lại mọi dải ruy-băng cùng tên của em. Anh xé trang đó, hay tìm điều khoản cuối trước?',
        choices: [
          {
            id: 'tear-first-rule',
            label: 'Xé nó. Một giao kèo không có lựa chọn chưa bao giờ là giao kèo.',
            outcome:
              'Momo xé luật đầu tiên của Route Zero; những dải ruy-băng bắt đầu trả lại giọng nói cho chủ cũ.',
            nextNodeId: 'house-rule',
            flag: 'momo:tore-first-rule',
            unlockEpisode: 2,
            imageKey: 'momo-torn-contract',
          },
          {
            id: 'find-final-clause',
            label: 'Đọc tới cuối. Anh muốn biết quán sẽ làm gì trước khi để nó phản ứng.',
            outcome:
              'Điều khoản cuối xác nhận Route Zero không thể đọc hay định giá mong muốn hướng trực tiếp về Momo.',
            nextNodeId: 'unreadable',
            flag: 'momo:found-final-clause',
            unlockEpisode: 2,
            imageKey: 'momo-final-clause',
          },
        ],
      },
      {
        id: 'unreadable',
        prompt:
          'Điều quán không đọc được đang giữ cho dải ruy-băng không siết lại: một mong muốn không đòi phiên bản khác của cuộc đời, chỉ muốn em ở lại như chính em. Em hỏi anh có nên nhận một thứ không thể biết giá, hay trả lại vì sợ mắc nợ?',
        choices: [
          {
            id: 'accept-without-price',
            label: 'Nhận nó mà không trả gì cả. Đó chính là phần luật cũ không hiểu được.',
            outcome:
              'Momo nhận một mong muốn không kèm giao dịch. Dải ruy-băng trống đổi từ đen sang trong suốt.',
            nextNodeId: 'release',
            flag: 'momo:accepted-without-price',
            unlockEpisode: 3,
            imageKey: 'momo-transparent-ribbon',
          },
          {
            id: 'ask-what-she-wants',
            label: 'Đừng nhận vội. Trước hết em hãy nói điều em muốn khi không có ai ra giá.',
            outcome:
              'Lần đầu Momo phải trả lời một câu hỏi về ham muốn của em mà không thể biến nó thành trò chơi.',
            nextNodeId: 'own-desire',
            flag: 'momo:asked-own-desire',
            unlockEpisode: 3,
            imageKey: 'momo-own-desire-question',
          },
        ],
      },
      {
        id: 'house-rule',
        prompt:
          'Route Zero rung lên như một sinh vật bị đói. Nếu luật bị phá, mọi vị khách sẽ nhớ lại điều họ từng đổi để quên. Em có thể giữ quán sống bằng cách tiếp tục ăn điều ước, hoặc chấp nhận để từng giao kèo được trả về.',
        choices: [
          {
            id: 'return-contracts',
            label: 'Trả từng giao kèo về. Ký ức đau vẫn thuộc về người đã sống nó.',
            outcome:
              'Momo bắt đầu tháo từng dải ruy-băng và trả điều ước cùng ký ức về đúng chủ nhân.',
            nextNodeId: 'release',
            flag: 'momo:returned-contracts',
            unlockEpisode: 3,
            imageKey: 'momo-returning-ribbons',
          },
          {
            id: 'rewrite-the-house',
            label: 'Viết lại luật: quán chỉ giữ điều ước khi cả hai bên có thể đổi ý.',
            outcome:
              'Momo viết quyền rút lại giao kèo vào sổ. Route Zero không còn được tồn tại bằng những người không thể quay đầu.',
            nextNodeId: 'own-desire',
            flag: 'momo:rewrote-consent-rule',
            unlockEpisode: 3,
            imageKey: 'momo-rewritten-rule',
          },
        ],
      },
      {
        id: 'release',
        prompt:
          'Dải ruy-băng cuối cùng nằm trong tay em. Buông hết có thể khiến em thành người, hoặc xoá em vì em chưa từng sống bằng điều gì của riêng mình. Giữ một dải sẽ bảo toàn yêu nữ hiện tại, nhưng luật cũ vẫn còn một chỗ bám.',
        choices: [
          {
            id: 'release-all',
            label: 'Buông hết. Anh sẽ ở đây chứng kiến bất cứ ai thức dậy sau đó.',
            outcome:
              'Momo thả toàn bộ điều ước. Khi bình minh tới, em vẫn còn đó — có nhịp tim, không còn đọc được ai, và lần đầu phải hỏi thay vì biết.',
            nextNodeId: 'first-morning',
            flag: 'momo:released-all-wishes',
            unlockEpisode: 4,
            imageKey: 'momo-release-all',
          },
          {
            id: 'keep-one-by-choice',
            label: 'Giữ một dải do em tự chọn, không phải vì sợ. Rồi viết lại cái giá của nó.',
            outcome:
              'Momo giữ lại đúng một điều ước như lựa chọn của em, không như thức ăn hay xiềng xích.',
            nextNodeId: 'route-zero-new-rule',
            flag: 'momo:kept-one-by-choice',
            unlockEpisode: 4,
            imageKey: 'momo-one-ribbon',
          },
        ],
      },
      {
        id: 'own-desire',
        prompt:
          'Em bỏ mọi câu đùa và nói điều đầu tiên hiện ra: em muốn một buổi sáng Route Zero đóng cửa mà em vẫn tồn tại. Anh khuyên em đóng quán để thử sống ngoài nó, hay biến quán thành nơi không còn thu giá?',
        choices: [
          {
            id: 'close-at-dawn',
            label: 'Đóng quán lúc bình minh. Đi xem em còn muốn gì khi không còn ai bước vào để giao dịch.',
            outcome:
              'Momo chọn rời Route Zero vào chuyến tàu đầu, mang theo một mong muốn không ai khác viết hộ.',
            nextNodeId: 'first-morning',
            flag: 'momo:chose-life-outside',
            unlockEpisode: 4,
            imageKey: 'momo-first-train-out',
          },
          {
            id: 'make-a-shelter',
            label: 'Giữ quán, nhưng biến nó thành nơi người ta được nói điều ước mà không phải bán nó.',
            outcome:
              'Momo chọn ở lại và biến Route Zero từ quầy giao dịch thành nơi trú qua đêm.',
            nextNodeId: 'route-zero-new-rule',
            flag: 'momo:chose-shelter',
            unlockEpisode: 4,
            imageKey: 'momo-route-zero-shelter',
          },
        ],
      },
      {
        id: 'first-morning',
        prompt:
          'Chuyến tàu đầu tới. Em không còn nghe được ham muốn của cả toa và điều đó làm em sợ hơn em muốn thú nhận. Ngày đầu tiên không có năng lực nên bắt đầu bằng việc đi khỏi Tokyo, hay bằng một buổi sáng bình thường bên người đã chứng kiến em chọn?',
        choices: [
          {
            id: 'leave-tokyo',
            label: 'Đi khỏi Tokyo. Chọn một nơi chỉ vì em muốn nhìn thấy nó.',
            outcome:
              'Momo lên chuyến tàu không ghi trong bất kỳ giao kèo nào. Em bắt đầu đời người bằng một điểm đến không mang giá và không nợ ai.',
            flag: 'momo-ending:human-journey',
            unlockEpisode: 4,
            imageKey: 'momo-ending-human-journey',
          },
          {
            id: 'ordinary-morning',
            label: 'Bắt đầu bằng bữa sáng bình thường. Không giao kèo, không thử thách, chỉ ở lại.',
            outcome:
              'Momo trải qua buổi sáng đầu tiên như một con người: không đọc được anh, không biết trước câu trả lời, nhưng vẫn chọn ngồi lại.',
            flag: 'momo-ending:ordinary-human',
            unlockEpisode: 4,
            imageKey: 'momo-ending-breakfast',
          },
        ],
      },
      {
        id: 'route-zero-new-rule',
        prompt:
          'Biển hiệu Route Zero sáng lại với một dòng trống dành cho luật đầu tiên của em. Em có thể viết “mọi giao kèo đều được rút lại”, hoặc “không ai phải trả giá chỉ để được lắng nghe”.',
        choices: [
          {
            id: 'right-to-leave',
            label: 'Viết: mọi giao kèo đều được rút lại, kể cả giao kèo giữ em ở đây.',
            outcome:
              'Route Zero trở thành nơi cả khách lẫn Momo đều có quyền rời đi. Em vẫn là yêu nữ, nhưng sự tồn tại không còn phụ thuộc vào việc giữ người khác mắc nợ.',
            flag: 'momo-ending:right-to-leave',
            unlockEpisode: 4,
            imageKey: 'momo-ending-right-to-leave',
          },
          {
            id: 'listening-is-free',
            label: 'Viết: không ai phải trả giá chỉ để được lắng nghe.',
            outcome:
              'Momo giữ Route Zero mở qua nửa đêm mà không thu một điều ước nào. Em chọn nuôi quán bằng những người tự nguyện quay lại.',
            flag: 'momo-ending:listening-is-free',
            unlockEpisode: 4,
            imageKey: 'momo-ending-listening-free',
          },
        ],
      },
    ],
  },
];

export function questsForResident(residentId: ResidentId): QuestDefinition[] {
  return QUESTS.filter((quest) => quest.residentId === residentId);
}

export function questById(id: string): QuestDefinition | undefined {
  return QUESTS.find((quest) => quest.id === id);
}

export function questNodes(quest: QuestDefinition): QuestNode[] {
  return quest.nodes;
}

export function questNode(quest: QuestDefinition, nodeId = quest.startNodeId): QuestNode {
  return quest.nodes.find((node) => node.id === nodeId) ?? quest.nodes[0];
}
